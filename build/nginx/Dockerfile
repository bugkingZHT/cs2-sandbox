# nginx 自定义镜像，用于 deploy/nginx.yaml 等场景
# 基于 alpine，与 deploy 中使用的 nginx:alpine 兼容；可按需拷贝默认配置或扩展模块
FROM --platform=linux/amd64 docker.m.daocloud.io/library/nginx:alpine

# 可选：拷贝项目内默认 nginx 配置（deploy 中通常用 ConfigMap 挂载，此处仅作备用）
# COPY nginx.conf /etc/nginx/nginx.conf

EXPOSE 80 443
