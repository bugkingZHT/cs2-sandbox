// Package localapp is the single-user, loopback-only desktop backend.
package localapp

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io/fs"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"sync"

	"github.com/bugkingzht/cs-demobox/pkg/engine"
	"github.com/bugkingzht/cs-demobox/pkg/engine/entity"
)

type State struct {
	ID         string             `json:"id"`
	Name       string             `json:"name"`
	Status     string             `json:"status"`
	Message    string             `json:"message"`
	Progress   int                `json:"progress"`
	BytesRead  int64              `json:"bytesRead"`
	TotalBytes int64              `json:"totalBytes"`
	Rounds     []int              `json:"rounds"`
	Meta       *entity.ReplayMeta `json:"meta"`
	SourcePath string             `json:"sourcePath,omitempty"`
}

type Server struct {
	mu        sync.Mutex
	state     State
	library   map[string]State
	root      string
	token     string
	cancel    context.CancelFunc
	wg        sync.WaitGroup
	unlock    func()
	closeOnce sync.Once
	queue     []importJob
	working   bool
	closed    bool
	Shutdown  func()
}

func New() (*Server, error) {
	base, err := os.UserCacheDir()
	if err != nil {
		return nil, err
	}
	return newAt(filepath.Join(base, "cs2-sandbox"))
}

func newAt(root string) (*Server, error) {
	if err := os.MkdirAll(root, 0700); err != nil {
		return nil, err
	}
	unlock, err := lockStore(root)
	if err != nil {
		return nil, err
	}
	b := make([]byte, 32)
	if _, err = rand.Read(b); err != nil {
		unlock()
		return nil, err
	}
	s := &Server{root: root, unlock: unlock, token: hex.EncodeToString(b), library: make(map[string]State), state: State{Status: "idle", Rounds: []int{}}}
	if err := s.loadLibrary(); err != nil {
		unlock()
		return nil, err
	}
	return s, nil
}
func (s *Server) Token() string { return s.token }
func (s *Server) Close() {
	s.closeOnce.Do(func() {
		s.mu.Lock()
		s.closed = true
		if s.cancel != nil {
			s.cancel()
		}
		s.mu.Unlock()
		s.wg.Wait()
		s.unlock()
	})
}
func send(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(v)
}
func fail(w http.ResponseWriter, err error, code int) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
}

func (s *Server) Handler(assets fs.FS) http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("/api/state", func(w http.ResponseWriter, r *http.Request) { s.mu.Lock(); defer s.mu.Unlock(); send(w, s.state) })
	mux.HandleFunc("/api/browse", s.browse)
	mux.HandleFunc("/api/open", s.open)
	mux.HandleFunc("/api/import", s.importFiles)
	mux.HandleFunc("/api/round", s.round)
	mux.HandleFunc("/api/library", s.list)
	mux.HandleFunc("/api/remove", s.remove)
	mux.HandleFunc("/api/quit", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "POST" {
			w.WriteHeader(405)
			return
		}
		send(w, map[string]bool{"ok": true})
		if s.Shutdown != nil {
			go s.Shutdown()
		}
	})
	files := http.FileServer(http.FS(assets))
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/replayer" || r.URL.Path == "/demolib" {
			r.URL.Path = "/"
		}
		files.ServeHTTP(w, r)
	})
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Reject DNS rebinding and cross-site requests. No login or tenant state.
		if !strings.HasPrefix(r.Host, "127.0.0.1:") {
			http.Error(w, "Invalid host", 403)
			return
		}
		if origin := r.Header.Get("Origin"); origin != "" && origin != "http://"+r.Host {
			http.Error(w, "Invalid origin", 403)
			return
		}
		if strings.HasPrefix(r.URL.Path, "/api/") && r.Header.Get("X-Local-Token") != s.token {
			http.Error(w, "Invalid local session", 403)
			return
		}
		w.Header().Set("Cache-Control", "no-store")
		w.Header().Set("X-Content-Type-Options", "nosniff")
		mux.ServeHTTP(w, r)
	})
}

func (s *Server) browse(w http.ResponseWriter, r *http.Request) {
	path := r.URL.Query().Get("path")
	if path == "" {
		path, _ = os.UserHomeDir()
	}
	path = filepath.Clean(path)
	if !filepath.IsAbs(path) {
		fail(w, fmt.Errorf("请输入文件夹的完整路径"), 400)
		return
	}
	entries, err := os.ReadDir(path)
	if err != nil {
		fail(w, err, 400)
		return
	}
	type entry struct {
		Name      string `json:"name"`
		Path      string `json:"path"`
		Directory bool   `json:"directory"`
	}
	items := []entry{}
	for _, e := range entries {
		if e.IsDir() || strings.EqualFold(filepath.Ext(e.Name()), ".dem") {
			items = append(items, entry{e.Name(), filepath.Join(path, e.Name()), e.IsDir()})
		}
	}
	sort.Slice(items, func(i, j int) bool {
		if items[i].Directory != items[j].Directory {
			return items[i].Directory
		}
		return strings.ToLower(items[i].Name) < strings.ToLower(items[j].Name)
	})
	send(w, struct {
		Path   string  `json:"path"`
		Parent string  `json:"parent"`
		Items  []entry `json:"items"`
	}{path, filepath.Dir(path), items})
}

func (s *Server) open(w http.ResponseWriter, r *http.Request) {
	if r.Method != "POST" {
		w.WriteHeader(405)
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
	var req struct {
		Path string `json:"path"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 32768)).Decode(&req); err != nil {
		fail(w, err, 400)
		return
	}
	path := filepath.Clean(req.Path)
	if !filepath.IsAbs(path) || !strings.EqualFold(filepath.Ext(path), ".dem") {
		fail(w, fmt.Errorf("请选择本机 .dem 文件的完整路径"), 400)
		return
	}
	f, err := os.Open(path)
	if err != nil {
		fail(w, err, 400)
		return
	}
	st, err := f.Stat()
	if err != nil || !st.Mode().IsRegular() {
		f.Close()
		fail(w, fmt.Errorf("无法读取该 Demo 文件"), 400)
		return
	}
	f.Close()
	job, err := s.prepareJob(path, filepath.Base(path), path, st.Size(), false)
	if err != nil {
		fail(w, err, 500)
		return
	}
	if err := s.enqueue([]importJob{job}); err != nil {
		os.RemoveAll(filepath.Join(s.root, job.state.ID))
		fail(w, err, 503)
		return
	}
	send(w, job.state)
}

func (s *Server) parse(ctx context.Context, f *os.File, id string) {
	defer f.Close()
	setError := func(err any) {
		s.mu.Lock()
		s.state.Status = "error"
		s.state.Message = fmt.Sprint(err)
		if saveErr := s.persist(s.state); saveErr != nil {
			s.state.Message += "；保存失败：" + saveErr.Error()
		}
		s.library[id] = s.state
		s.mu.Unlock()
	}
	defer func() {
		if v := recover(); v != nil {
			setError(fmt.Sprintf("Demo 解析失败：%v", v))
		}
	}()
	e := engine.NewDemoEngine(engine.EngineConfig{ResolveFreezeTime: false, FrameRatio: 4})
	defer e.Close()
	if err := e.InitParser(f); err != nil {
		setError(err)
		return
	}
	meta, err := e.ExtractMetadata()
	if err != nil {
		setError(err)
		return
	}
	s.mu.Lock()
	s.state.Meta = meta
	s.library[id] = s.state
	s.mu.Unlock()
	updateProgress := func(n string) {
		offset, seekErr := f.Seek(0, 1)
		s.mu.Lock()
		defer s.mu.Unlock()
		if seekErr == nil && s.state.TotalBytes > 0 {
			s.state.BytesRead = offset
			s.state.Progress = max(s.state.Progress, min(99, int(offset*99/s.state.TotalBytes)))
		}
		s.state.Message = "已读取 " + n + " 帧"
		s.library[id] = s.state
	}
	for {
		if ctx.Err() != nil {
			setError("上次解析已中断，请重新选择源文件解析")
			return
		}
		round, err := e.ParseNextRound(updateProgress)
		if err != nil {
			setError(err)
			return
		}
		if round == nil {
			break
		}
		if len(round.Frames) == 0 || round.Round <= 0 {
			continue
		}
		// The parser can append the first frame of the following round at a
		// boundary. Keep each response confined to its advertised round.
		for len(round.Frames) > 0 && round.Frames[len(round.Frames)-1].Round != round.Round {
			round.Frames = round.Frames[:len(round.Frames)-1]
		}
		if len(round.Frames) == 0 {
			continue
		}
		err = writeJSONAtomic(filepath.Join(s.root, id, strconv.Itoa(round.Round)+".json"), round)
		if err != nil {
			setError(err)
			return
		}
		s.mu.Lock()
		s.state.Rounds = append(s.state.Rounds, round.Round)
		s.library[id] = s.state
		s.mu.Unlock()
	}
	meta, err = e.BackfillMeta(meta)
	if err != nil {
		setError(err)
		return
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if len(s.state.Rounds) == 0 {
		s.state.Status = "error"
		s.state.Message = "Demo 中没有可播放的回合"
		if err := s.persist(s.state); err != nil {
			s.state.Message += "；保存失败：" + err.Error()
		}
		s.library[id] = s.state
		return
	}
	meta.TotalRounds = len(s.state.Rounds)
	meta.UploaderUID = ""
	meta.Status = 1
	meta.ParsingProgress = 100
	meta.ParsingStatus = "解析完成"
	meta.FileName = strings.TrimSuffix(s.state.Name, filepath.Ext(s.state.Name))
	meta.OriginPath = s.state.SourcePath
	s.state.Meta = meta
	s.state.Status = "ready"
	s.state.Message = "解析完成"
	s.state.Progress = 100
	s.state.BytesRead = s.state.TotalBytes
	if err := s.persist(s.state); err != nil {
		s.state.Status = "error"
		s.state.Message = "解析完成但保存失败：" + err.Error()
	}
	s.library[id] = s.state
}

func (s *Server) round(w http.ResponseWriter, r *http.Request) {
	s.mu.Lock()
	defer s.mu.Unlock()
	n, err := strconv.Atoi(r.URL.Query().Get("n"))
	if err != nil || n < 0 {
		fail(w, fmt.Errorf("无效回合"), 400)
		return
	}
	id := r.URL.Query().Get("id")
	st, ok := s.library[id]
	if !ok || st.Status != "ready" {
		fail(w, fmt.Errorf("回放未就绪"), 409)
		return
	}
	http.ServeFile(w, r, filepath.Join(s.root, id, strconv.Itoa(n)+".json"))
}

func (s *Server) list(w http.ResponseWriter, r *http.Request) {
	s.mu.Lock()
	defer s.mu.Unlock()
	items := make([]State, 0, len(s.library))
	for _, st := range s.library {
		items = append(items, st)
	}
	sort.Slice(items, func(i, j int) bool { return items[i].Name < items[j].Name })
	send(w, items)
}

// Remove only our generated replay cache, never the user's source .dem.
func (s *Server) remove(w http.ResponseWriter, r *http.Request) {
	if r.Method != "POST" {
		w.WriteHeader(405)
		return
	}
	var req struct {
		ID string `json:"id"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 32768)).Decode(&req); err != nil {
		fail(w, err, 400)
		return
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, ok := s.library[req.ID]; !ok {
		fail(w, fmt.Errorf("回放不存在"), 404)
		return
	}
	if isPending(s.library[req.ID].Status) {
		fail(w, fmt.Errorf("解析中不能移除，请等待完成"), 409)
		return
	}
	if err := os.RemoveAll(filepath.Join(s.root, req.ID)); err != nil {
		fail(w, err, 500)
		return
	}
	delete(s.library, req.ID)
	if s.state.ID == req.ID {
		s.state = State{Status: "idle", Rounds: []int{}}
	}
	send(w, map[string]bool{"ok": true})
}
