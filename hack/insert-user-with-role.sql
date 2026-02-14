-- 插入用户并为其订阅角色（pro 或 pro+）
-- 使用前请根据需要修改下方变量：
--   @username  登录用户名
--   @password_hash  bcrypt 哈希
--   @role     订阅角色：'pro' 或 'pro+'

SET @username = 'xxxxxx';
SET @password_hash = 'xxxxxxxxxxxxxxxxxxxxxxxx';
SET @role = 'pro';   -- 或 'pro+'

-- 生成 8 位 UID（A-Z0-9），简单起见用时间戳后 8 位，保证不重复
SET @uid = UPPER(SUBSTRING(MD5(CONCAT(@username, UNIX_TIMESTAMP())), 1, 8));

INSERT INTO users (uid, username, email, phone, password_hash, status, created_at, updated_at)
VALUES (@uid, @username, '', '', @password_hash, 1, NOW(), NOW());

SET @user_id = LAST_INSERT_ID();

INSERT INTO role_subscriptions (order_id, user_id, role, started_at, ends_at, is_active, created_at, updated_at)
VALUES (
  CONCAT('sql-', @username, '-', @role, '-', UNIX_TIMESTAMP()),
  @user_id,
  @role,
  NOW(),
  '2099-01-01 00:00:00',
  1,
  NOW(),
  NOW()
);

SELECT @user_id AS user_id, @uid AS uid, @username AS username, @role AS role;
