package main

import (
	"context"
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
	"time"
)

func main() {
	if err := run(); err != nil {
		log.Print(err)
		showStartupError(err.Error())
	}
}
func run() error {
	noBrowser := flag.Bool("no-browser", false, "Do not open a browser (for diagnostics)")
	address := flag.String("listen", "127.0.0.1:0", "Loopback listen address")
	flag.Parse()
	instance, err := acquireInstance(instanceName, !*noBrowser)
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
	ln, err := net.Listen("tcp", *address)
	if err != nil {
		return err
	}
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
