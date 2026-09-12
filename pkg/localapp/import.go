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
		ID: id, Name: name, AliasName: defaultAlias(name), SourcePath: origin, TotalBytes: size,
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

type importResult struct {
	Items      []State  `json:"items"`
	Skipped    []string `json:"skipped"`
	Duplicates []string `json:"duplicates"`
}

func (s *Server) enqueueUnique(jobs []importJob) (importResult, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	result := importResult{Items: []State{}, Skipped: []string{}, Duplicates: []string{}}
	if s.closed {
		return result, fmt.Errorf("本地服务正在退出")
	}
	known := s.knownNames()
	// Snapshot archive names before this batch, so siblings in one ZIP are accepted.
	previous := s.knownNames()
	for _, job := range jobs {
		if known[job.state.Name] || (job.state.UploadName != "" && previous[job.state.UploadName]) {
			if previous[job.state.Name] || previous[job.state.UploadName] {
				result.Skipped = append(result.Skipped, job.state.Name)
			} else {
				result.Duplicates = append(result.Duplicates, job.state.Name)
			}
			os.RemoveAll(filepath.Join(s.root, job.state.ID))
			continue
		}
		known[job.state.Name] = true
		s.library[job.state.ID] = job.state
		result.Items = append(result.Items, job.state)
		if isPending(job.state.Status) {
			s.queue = append(s.queue, job)
		}
	}
	if !s.working && len(s.queue) > 0 {
		s.working = true
		s.state = s.queue[0].state
		ctx, cancel := context.WithCancel(context.Background())
		s.cancel = cancel
		s.wg.Add(1)
		go s.runQueue(ctx)
	}
	return result, nil
}

func (s *Server) runQueue(ctx context.Context) {
	defer s.wg.Done()
	for {
		s.mu.Lock()
		if ctx.Err() != nil || len(s.queue) == 0 {
			for _, job := range s.queue {
				st := s.library[job.state.ID]
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
		s.state = s.library[job.state.ID]
		s.state.Status, s.state.Message = "parsing", "正在读取比赛…"
		s.library[job.state.ID] = s.state
		s.mu.Unlock()

		if f, err := os.Open(job.path); err != nil {
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
	// Inspect archives before replying so the modal can report duplicates found
	// inside ZIPs too. Actual Demo parsing still runs in the background queue.
	s.mu.Lock()
	known := s.knownNames()
	s.mu.Unlock()
	skipped := []string{}
	duplicates := []string{}
	seenUploads := map[string]bool{}
	expanded := []importJob{}
	for _, job := range append([]importJob(nil), jobs...) {
		if known[job.state.Name] {
			skipped = append(skipped, job.state.Name)
			os.RemoveAll(filepath.Join(s.root, job.state.ID))
			continue
		}
		if seenUploads[job.state.Name] {
			duplicates = append(duplicates, job.state.Name)
			os.RemoveAll(filepath.Join(s.root, job.state.ID))
			continue
		}
		seenUploads[job.state.Name] = true
		if !strings.EqualFold(filepath.Ext(job.state.Name), ".zip") {
			expanded = append(expanded, job)
			continue
		}
		children := []importJob{}
		err := s.collectArchive(r.Context(), job.path, job.state.Name, staging, 0, &archiveBudget{}, &children)
		jobs = append(jobs, children...)
		if err == nil && len(children) == 0 {
			err = fmt.Errorf("ZIP 中没有找到 .dem 文件")
		}
		if err != nil {
			for _, child := range children {
				os.RemoveAll(filepath.Join(s.root, child.state.ID))
			}
			job.state.Status, job.state.Message = "error", err.Error()
			os.Remove(job.path)
			if saveErr := s.persist(job.state); saveErr != nil {
				fail(w, saveErr, 500)
				return
			}
			expanded = append(expanded, job)
			continue
		}
		for _, child := range children {
			child.state.UploadName = job.state.Name
			if err := s.persist(child.state); err != nil {
				fail(w, err, 500)
				return
			}
			expanded = append(expanded, child)
		}
		os.RemoveAll(filepath.Join(s.root, job.state.ID))
	}
	result, err := s.enqueueUnique(expanded)
	if err != nil {
		fail(w, err, 503)
		return
	}
	accepted = true
	result.Skipped = append(skipped, result.Skipped...)
	result.Duplicates = append(duplicates, result.Duplicates...)
	send(w, result)
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
