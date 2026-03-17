package email

import (
	"crypto/tls"
	"fmt"
	"net"
	"net/smtp"
	"strings"
)

// Config holds SMTP configuration for sending emails.
// Environment variables (see constants package):
//
//	SNOWBO_SMTP_HOST     e.g. smtp.qq.com
//	SNOWBO_SMTP_PORT     e.g. 465 (SSL) or 587 (STARTTLS)
//	SNOWBO_SMTP_USER     sender email address (also used as auth username)
//	SNOWBO_SMTP_PASS     SMTP authorization code (NOT login password)
//	SNOWBO_SMTP_FROM     optional display name, e.g. "Snowbo <no-reply@qq.com>"
type Config struct {
	Host string
	Port string
	User string
	Pass string
	From string // optional; defaults to User
}

// IsConfigured returns true if all required fields are set.
func (c Config) IsConfigured() bool {
	return c.Host != "" && c.Port != "" && c.User != "" && c.Pass != ""
}

// Sender sends transactional emails via SMTP.
type Sender struct {
	cfg Config
}

// NewSender returns a new Sender with the given config.
func NewSender(cfg Config) *Sender {
	return &Sender{cfg: cfg}
}

// SendVerificationCode sends a verification code to the given address.
func (s *Sender) SendVerificationCode(to, code, purpose string) error {
	purposeText := "邮箱验证"
	if purpose == "register" {
		purposeText = "注册"
	} else if purpose == "reset_password" {
		purposeText = "重置密码"
	}
	subject := "【Snowbo】验证码"
	body := fmt.Sprintf(
		"您正在进行【%s】操作，验证码为：%s\n\n验证码 10 分钟内有效，请勿泄露给他人。\n\n如非本人操作，请忽略此邮件。",
		purposeText, code,
	)
	return s.send(to, subject, body)
}

func (s *Sender) send(to, subject, body string) error {
	from := s.cfg.From
	if from == "" {
		from = s.cfg.User
	}
	msg := buildMessage(from, to, subject, body)

	// QQ mail (and many CN providers) use SSL on port 465.
	if s.cfg.Port == "465" {
		return s.sendSSL(to, msg)
	}
	// Port 587 / 25: STARTTLS or plain.
	return s.sendPlain(to, msg)
}

// sendSSL connects via TLS directly (port 465).
func (s *Sender) sendSSL(to string, msg []byte) error {
	addr := net.JoinHostPort(s.cfg.Host, s.cfg.Port)
	conn, err := tls.Dial("tcp", addr, &tls.Config{ServerName: s.cfg.Host})
	if err != nil {
		return fmt.Errorf("smtp tls dial: %w", err)
	}
	client, err := smtp.NewClient(conn, s.cfg.Host)
	if err != nil {
		return fmt.Errorf("smtp new client: %w", err)
	}
	defer client.Close()

	auth := smtp.PlainAuth("", s.cfg.User, s.cfg.Pass, s.cfg.Host)
	if err := client.Auth(auth); err != nil {
		return fmt.Errorf("smtp auth: %w", err)
	}
	if err := client.Mail(s.cfg.User); err != nil {
		return fmt.Errorf("smtp MAIL FROM: %w", err)
	}
	if err := client.Rcpt(to); err != nil {
		return fmt.Errorf("smtp RCPT TO: %w", err)
	}
	w, err := client.Data()
	if err != nil {
		return fmt.Errorf("smtp DATA: %w", err)
	}
	if _, err := w.Write(msg); err != nil {
		return fmt.Errorf("smtp write body: %w", err)
	}
	return w.Close()
}

// sendPlain uses smtp.SendMail (supports STARTTLS, port 587/25).
func (s *Sender) sendPlain(to string, msg []byte) error {
	addr := net.JoinHostPort(s.cfg.Host, s.cfg.Port)
	auth := smtp.PlainAuth("", s.cfg.User, s.cfg.Pass, s.cfg.Host)
	return smtp.SendMail(addr, auth, s.cfg.User, []string{to}, msg)
}

func buildMessage(from, to, subject, body string) []byte {
	var sb strings.Builder
	sb.WriteString("From: " + from + "\r\n")
	sb.WriteString("To: " + to + "\r\n")
	sb.WriteString("Subject: " + subject + "\r\n")
	sb.WriteString("MIME-Version: 1.0\r\n")
	sb.WriteString("Content-Type: text/plain; charset=UTF-8\r\n")
	sb.WriteString("\r\n")
	sb.WriteString(body)
	return []byte(sb.String())
}
