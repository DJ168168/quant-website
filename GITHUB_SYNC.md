# GitHub 同步与自动部署

## 目标

- Replit 改完代码后同步到 GitHub
- GitHub main 更新后自动部署到 Evoxt
- 线上站点 `zhangyong.guru` 始终保持最新版本

## 代码更新流程

1. 在 Replit 修改 `quant-console`
2. 提交到 GitHub 仓库 `DJ168168/quant-website`
3. 推送到 `main`
4. GitHub Actions 连接 Evoxt
5. Evoxt 执行拉取、构建、重启

## 服务器更新命令

```bash
cd /opt/quant-console
git pull origin main
npm install
npm run build
pm2 restart quant-console
```

## 服务器侧要求

- 域名解析到服务器 IP
- Nginx 反代到应用端口
- 配置 HTTPS
- PM2 常驻运行

## 说明

- Replit 预览只用于开发检查
- 线上站点以 Evoxt 上的仓库为准
- 如果线上没更新，先检查 GitHub 是否已推送，再检查服务器是否已拉取
