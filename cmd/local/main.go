package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"github.com/bugkingzht/cs-demobox/pkg/localapp"
	"github.com/bugkingzht/cs-demobox/web"
	"io/fs"
	"log"
	"net"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"time"
)

func main() {
	if err := run(); err != nil {
		log.Print(err)
		if noBrowser := flag.Lookup("no-browser"); noBrowser == nil || noBrowser.Value.String() != "true" {
			showStartupError(err.Error())
		}
		os.Exit(1)
	}
}
func run() error {
	noBrowser := flag.Bool("no-browser", false, "Do not open a browser (for diagnostics)")
	address := flag.String("listen", "127.0.0.1:0", "Loopback listen address")
	buildInfo := flag.Bool("build-info", false, "Print executable SHA-256 identity without starting a server")
	flag.Parse()
	identity, err := currentBuildIdentity()
	if err != nil {
		return err
	}
	if *buildInfo {
		return json.NewEncoder(os.Stdout).Encode(identity)
	}
	if existing, err := activateExistingInstance(identity.instanceName(), !*noBrowser); err != nil || existing {
		return err
	}
	if launched, err := launchNamedProcess(identity); err != nil || launched {
		return err
	}
	instance, err := acquireInstance(identity.instanceName(), !*noBrowser)
	if err != nil {
		return err
	}
	if instance == nil {
		fmt.Println("cs2-sandbox: existing instance; duplicate launcher exiting")
		return nil
	}
	defer instance.Close()
	host, _, err := net.SplitHostPort(*address)
	if err != nil || host != "127.0.0.1" {
		return fmt.Errorf("only 127.0.0.1 is supported")
	}
	assets, err := fs.Sub(web.LocalAssets, "localdist")
	if err != nil {
		return err
	}
	if _, err = fs.Stat(assets, "index.html"); err != nil {
		return fmt.Errorf("build the local frontend first: %w", err)
	}
	app, err := localapp.New()
	if err != nil {
		return err
	}
	defer app.Close()
	app.BuildUID = identity.UID
	ln, err := net.Listen("tcp", *address)
	if err != nil {
		return err
	}
	defer ln.Close()
	if err := identity.writeRuntimeInfo(ln.Addr().String()); err != nil {
		return err
	}
	defer os.Remove(filepath.Join(identity.RuntimeDir, "instance.json"))
	server := &http.Server{Handler: app.Handler(assets), ReadHeaderTimeout: 10 * time.Second}
	app.Shutdown = func() {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		server.Shutdown(ctx)
	}
	stop := make(chan os.Signal, 1)
	signal.Notify(stop, os.Interrupt)
	defer signal.Stop(stop)
	go func() {
		select {
		case <-stop:
			app.Shutdown()
		}
	}()
	url := "http://" + ln.Addr().String() + "/#" + app.Token()
	fmt.Println("cs2-sandbox:", url)
	instance.Watch(func() {
		if err := openBrowser(url); err != nil {
			log.Printf("打开已有实例页面失败：%v", err)
		}
	})
	if !*noBrowser {
		if err = openBrowser(url); err != nil {
			log.Printf("请在浏览器打开上述地址: %v", err)
		}
	}
	err = server.Serve(ln)
	if err == http.ErrServerClosed {
		return nil
	}
	return err
}
