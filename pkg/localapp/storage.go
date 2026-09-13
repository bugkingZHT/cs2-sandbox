package localapp

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"
)

// Each replay is independently committed; an interrupted write cannot destroy
// the rest of the library. Uploaded source copies are temporary queue inputs.
func writeJSONAtomic(path string, value any) error {
	f, err := os.CreateTemp(filepath.Dir(path), ".write-*")
	if err != nil {
		return err
	}
	defer os.Remove(f.Name())
	err = json.NewEncoder(f).Encode(value)
	if err == nil {
		err = f.Sync()
	}
	closeErr := f.Close()
	if err == nil {
		err = closeErr
	}
	if err != nil {
		return err
	}
	return os.Rename(f.Name(), path)
}

func (s *Server) persist(st State) error {
	return writeJSONAtomic(filepath.Join(s.root, st.ID, "entry.json"), st)
}

func validEntryID(id string) bool {
	if id == "" {
		return false
	}
	for _, c := range id {
		if !(c >= 'a' && c <= 'z' || c >= 'A' && c <= 'Z' || c >= '0' && c <= '9' || c == '-') {
			return false
		}
	}
	return true
}

func (s *Server) loadLibrary() error {
	return s.loadLibrarySnapshot(true)
}

func (s *Server) loadLibrarySnapshot(recoverPending bool) error {
	dirs, err := os.ReadDir(s.root)
	if err != nil {
		return err
	}
	library := make(map[string]State)
	for _, dir := range dirs {
		if !dir.IsDir() || !validEntryID(dir.Name()) || dir.Type()&os.ModeSymlink != 0 {
			continue
		}
		id := dir.Name()
		data, err := os.ReadFile(filepath.Join(s.root, id, "entry.json"))
		var st State
		if err != nil || json.Unmarshal(data, &st) != nil || st.ID != id {
			// Preserve the directory and expose a recoverable error, never silently erase it.
			st = State{ID: id, Name: id, Status: "error", Message: "本地索引缺失或损坏，请重新解析源文件", Rounds: []int{}}
		}
		alive := s.shared && s.ownerAlive(st.Owner)
		if st.Staged && alive {
			continue // An upload is not published until cross-process deduplication commits it.
		}
		if isPending(st.Status) && recoverPending && !alive {
			st.Status = "error"
			st.Staged = false
			st.Message = "上次导入已中断，请重新选择文件解析"
			// Only remove our fixed-name temporary inputs, never SourcePath.
			os.Remove(filepath.Join(s.root, id, "source.dem"))
			os.Remove(filepath.Join(s.root, id, "source.zip"))
			if err := s.persist(st); err != nil {
				return err
			}
		}
		if st.Status == "ready" {
			if st.Meta == nil || st.Meta.UUID == "" || len(st.Rounds) == 0 {
				st.Status = "error"
			}
			for _, n := range st.Rounds {
				info, err := os.Stat(filepath.Join(s.root, id, strconv.Itoa(n)+".json"))
				if n <= 0 || err != nil || !info.Mode().IsRegular() || info.Size() == 0 {
					st.Status = "error"
					break
				}
			}
			if st.Status == "error" {
				st.Message = "本地解析缓存不完整，请重新解析源文件"
			}
		}
		if st.Status != "ready" && st.Status != "error" && !(isPending(st.Status) && (alive || !recoverPending)) {
			st.Status = "error"
			st.Message = "不支持的本地记录状态"
		}
		if strings.TrimSpace(st.Name) == "" {
			st.Name = id
		}
		if st.AliasName == "" {
			st.AliasName = defaultAlias(st.Name)
		}
		if st.UploadName == "" {
			origin := strings.SplitN(st.SourcePath, " / ", 2)[0]
			if strings.EqualFold(filepath.Ext(origin), ".zip") {
				st.UploadName = importName(origin)
			}
		}
		if s.shared && alive && st.Owner == s.owner && isPending(st.Status) {
			if active, ok := s.library[id]; ok && isPending(active.Status) {
				st = active // Keep the owning process's in-memory progress and queued aliases.
			}
		}
		library[id] = st
	}
	s.library = library
	return nil
}

func storeBusy(err error) error {
	return fmt.Errorf("无法打开 cs2-sandbox 本地数据目录，请确认没有另一个新版 cs2-sandbox 正在运行：%w", err)
}
