package localapp

import (
	"archive/zip"
	"context"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
)

const (
	maxImportBytes   int64 = 32 << 30
	maxExpandedBytes int64 = 64 << 30
	maxArchiveFiles        = 1000
	maxArchiveDepth        = 8
)

type importJob struct {
	state State
	path  string
	owned bool
}

func isPending(status string) bool {
	return status == "queued" || status == "extracting" || status == "parsing"
}

// Names are labels only. Never use upload/ZIP paths as filesystem destinations.
func importName(name string) string {
	return filepath.Base(strings.ReplaceAll(name, "\\", "/"))
}

func (s *Server) prepareJob(source, name, origin string, size int64, owned bool) (importJob, error) {
	b := make([]byte, 12)
	if _, err := rand.Read(b); err != nil {
		return importJob{}, err
	}
	id := hex.EncodeToString(b)
	dir := filepath.Join(s.root, id)
	if err := os.Mkdir(dir, 0700); err != nil {
		return importJob{}, err
	}
	job := importJob{path: source, owned: owned, state: State{
		ID: id, Name: name, SourcePath: origin, TotalBytes: size,
		Status: "queued", Message: "等待解析", Rounds: []int{},
	}}
	if strings.EqualFold(filepath.Ext(name), ".zip") {
		job.state.Message = "等待解压"
	}
	if owned {
		job.path = filepath.Join(dir, "source"+strings.ToLower(filepath.Ext(name)))
		if err := os.Rename(source, job.path); err != nil {
			os.RemoveAll(dir)
			return importJob{}, err
		}
	}
	if err := s.persist(job.state); err != nil {
		os.RemoveAll(dir)
		return importJob{}, err
	}
	return job, nil
}

func (s *Server) enqueue(jobs []importJob) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.closed {
		return fmt.Errorf("本地服务正在退出")
	}
	for _, job := range jobs {
		s.library[job.state.ID] = job.state
	}
	s.queue = append(s.queue, jobs...)
	if !s.working && len(s.queue) > 0 {
		s.working = true
		s.state = s.queue[0].state
		ctx, cancel := context.WithCancel(context.Background())
		s.cancel = cancel
		s.wg.Add(1)
		go s.runQueue(ctx)
	}
	return nil
}

func (s *Server) runQueue(ctx context.Context) {
	defer s.wg.Done()
	for {
		s.mu.Lock()
		if ctx.Err() != nil || len(s.queue) == 0 {
			for _, job := range s.queue {
				st := job.state
				st.Status, st.Message = "error", "导入已中断，请重新选择文件解析"
				s.persist(st)
				s.library[st.ID] = st
				if s.state.ID == st.ID {
					s.state = st
				}
				if job.owned {
					os.Remove(job.path)
				}
			}
			s.queue = nil
			s.working = false
			if s.cancel != nil {
				s.cancel()
			}
			s.cancel = nil
			s.mu.Unlock()
			return
		}
		job := s.queue[0]
		s.queue = s.queue[1:]
		s.state = job.state
		s.state.Status, s.state.Message = "parsing", "正在读取比赛…"
		if strings.EqualFold(filepath.Ext(job.state.Name), ".zip") {
			s.state.Status, s.state.Message = "extracting", "正在解压并查找 Demo…"
		}
		s.library[job.state.ID] = s.state
		s.mu.Unlock()

		if strings.EqualFold(filepath.Ext(job.state.Name), ".zip") {
			s.expandArchive(ctx, job)
		} else if f, err := os.Open(job.path); err != nil {
			s.importError(job.state.ID, err)
		} else {
			// Exactly one engine runs at a time, including after a parser panic.
			s.parse(ctx, f, job.state.ID)
		}
		if job.owned {
			os.Remove(job.path)
		}
	}
}

func (s *Server) importError(id string, err error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	st := s.library[id]
	st.Status, st.Message = "error", err.Error()
	if saveErr := s.persist(st); saveErr != nil {
		st.Message += "；保存失败：" + saveErr.Error()
	}
	s.library[id] = st
	if s.state.ID == id {
		s.state = st
	}
}

func (s *Server) importFiles(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	s.mu.Lock()
	if s.closed {
		s.mu.Unlock()
		fail(w, fmt.Errorf("本地服务正在退出"), 503)
		return
	}
	s.wg.Add(1)
	s.mu.Unlock()
	defer s.wg.Done()
	r.Body = http.MaxBytesReader(w, r.Body, maxImportBytes)
	reader, err := r.MultipartReader()
	if err != nil {
		fail(w, fmt.Errorf("请选择 .dem 或 .zip 文件"), 400)
		return
	}
	staging, err := os.MkdirTemp(s.root, ".import-")
	if err != nil {
		fail(w, err, 500)
		return
	}
	defer os.RemoveAll(staging)
	jobs := []importJob{}
	accepted := false
	defer func() {
		if !accepted {
			for _, job := range jobs {
				os.RemoveAll(filepath.Join(s.root, job.state.ID))
			}
		}
	}()
	for {
		part, err := reader.NextPart()
		if err == io.EOF {
			break
		}
		if err != nil {
			fail(w, fmt.Errorf("读取文件失败（每批最多 32 GB）：%w", err), 400)
			return
		}
		name := importName(part.FileName())
		ext := strings.ToLower(filepath.Ext(name))
		if part.FormName() != "files" || (ext != ".dem" && ext != ".zip") {
			part.Close()
			fail(w, fmt.Errorf("仅支持 .dem 和 .zip 文件：%s", name), 400)
			return
		}
		if len(jobs) >= maxArchiveFiles {
			part.Close()
			fail(w, fmt.Errorf("每批最多导入 1000 个文件"), 400)
			return
		}
		f, err := os.CreateTemp(staging, "file-*")
		if err != nil {
			part.Close()
			fail(w, err, 500)
			return
		}
		n, copyErr := io.Copy(f, part)
		closeErr := f.Close()
		part.Close()
		if copyErr != nil {
			fail(w, fmt.Errorf("接收 %s 失败（每批最多 32 GB）：%w", name, copyErr), 400)
			return
		}
		if closeErr != nil {
			fail(w, closeErr, 500)
			return
		}
		job, err := s.prepareJob(f.Name(), name, name, n, true)
		if err != nil {
			fail(w, err, 500)
			return
		}
		jobs = append(jobs, job)
	}
	if len(jobs) == 0 {
		fail(w, fmt.Errorf("请至少选择一个 .dem 或 .zip 文件"), 400)
		return
	}
	if err := s.enqueue(jobs); err != nil {
		fail(w, err, 503)
		return
	}
	accepted = true
	items := make([]State, len(jobs))
	for i, job := range jobs {
		items[i] = job.state
	}
	send(w, struct {
		Items []State `json:"items"`
	}{items})
}

type archiveBudget struct {
	bytes int64
	files int
}

type contextReader struct {
	ctx    context.Context
	reader io.Reader
}

func (r contextReader) Read(p []byte) (int, error) {
	if err := r.ctx.Err(); err != nil {
		return 0, err
	}
	return r.reader.Read(p)
}

// All entries are enumerated, including subdirectories and nested ZIPs. Inputs
// are copied to generated paths so duplicate basenames and ../ entries are safe.
func (s *Server) collectArchive(ctx context.Context, archivePath, origin, staging string, depth int, budget *archiveBudget, jobs *[]importJob) error {
	if depth > maxArchiveDepth {
		return fmt.Errorf("ZIP 嵌套层数超过 8 层")
	}
	zr, err := zip.OpenReader(archivePath)
	if err != nil {
		return fmt.Errorf("无法打开 ZIP %s：%w", origin, err)
	}
	defer zr.Close()
	for _, entry := range zr.File {
		if err := ctx.Err(); err != nil {
			return err
		}
		ext := strings.ToLower(filepath.Ext(entry.Name))
		if entry.FileInfo().IsDir() || (ext != ".dem" && ext != ".zip") {
			continue
		}
		if !entry.Mode().IsRegular() {
			continue
		}
		budget.files++
		if budget.files > maxArchiveFiles {
			return fmt.Errorf("ZIP 内文件数量超过 1000 个")
		}
		if entry.UncompressedSize64 > uint64(maxExpandedBytes-budget.bytes) {
			return fmt.Errorf("ZIP 解压总大小超过 64 GB")
		}
		rc, err := entry.Open()
		if err != nil {
			return fmt.Errorf("无法解压 %s：%w", entry.Name, err)
		}
		f, err := os.CreateTemp(staging, "entry-*")
		if err != nil {
			rc.Close()
			return err
		}
		n, copyErr := io.Copy(f, io.LimitReader(contextReader{ctx, rc}, maxExpandedBytes-budget.bytes+1))
		closeErr := f.Close()
		rc.Close()
		budget.bytes += n
		if copyErr != nil {
			return fmt.Errorf("解压 %s 失败：%w", entry.Name, copyErr)
		}
		if closeErr != nil {
			return closeErr
		}
		if budget.bytes > maxExpandedBytes {
			return fmt.Errorf("ZIP 解压总大小超过 64 GB")
		}
		entryOrigin := origin + " / " + entry.Name
		if ext == ".zip" {
			if err := s.collectArchive(ctx, f.Name(), entryOrigin, staging, depth+1, budget, jobs); err != nil {
				return err
			}
			os.Remove(f.Name())
		} else {
			job, err := s.prepareJob(f.Name(), importName(entry.Name), entryOrigin, n, true)
			if err != nil {
				return err
			}
			*jobs = append(*jobs, job)
		}
	}
	return nil
}

func (s *Server) expandArchive(ctx context.Context, archive importJob) {
	staging, err := os.MkdirTemp(s.root, ".extract-")
	if err != nil {
		s.importError(archive.state.ID, err)
		return
	}
	defer os.RemoveAll(staging)
	jobs := []importJob{}
	err = s.collectArchive(ctx, archive.path, archive.state.Name, staging, 0, &archiveBudget{}, &jobs)
	if err == nil && len(jobs) == 0 {
		err = fmt.Errorf("ZIP 中没有找到 .dem 文件")
	}
	if err != nil {
		for _, job := range jobs {
			os.RemoveAll(filepath.Join(s.root, job.state.ID))
		}
		s.importError(archive.state.ID, err)
		return
	}
	s.mu.Lock()
	for _, job := range jobs {
		s.library[job.state.ID] = job.state
	}
	// Parse this archive's demos before advancing to the next uploaded file.
	s.queue = append(jobs, s.queue...)
	delete(s.library, archive.state.ID)
	s.state = jobs[0].state
	s.mu.Unlock()
	// The expanded demos now own their individual inputs and library records.
	os.RemoveAll(filepath.Join(s.root, archive.state.ID))
}
