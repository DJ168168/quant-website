#!/bin/bash
# ============================================================
# 服务器一键初始化脚本
# 在 Evoxt 服务器上以 root 身份执行一次即可
# 服务器 IP: 108.165.255.236
# 域名: zhangyong.guru
# ============================================================
set -e

echo "====== [1/8] 更新系统 ======"
apt-get update -y && apt-get upgrade -y

echo "====== [2/8] 安装 Node.js 20 ======"
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs git nginx certbot python3-certbot-nginx

echo "====== [3/8] 安装 PM2 ======"
npm install -g pm2
mkdir -p /var/log/pm2
pm2 startup systemd -u root --hp /root | tail -1 | bash || true

echo "====== [4/8] 安装 PostgreSQL ======"
apt-get install -y postgresql postgresql-contrib
systemctl enable postgresql
systemctl start postgresql

echo "====== [5/8] 初始化数据库 ======"
sudo -u postgres psql -c "CREATE USER quantuser WITH PASSWORD 'QuantPass2024!';" 2>/dev/null || true
sudo -u postgres psql -c "CREATE DATABASE quantdb OWNER quantuser;" 2>/dev/null || true
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE quantdb TO quantuser;" 2>/dev/null || true

echo "====== [6/8] 拉取项目代码 ======"
mkdir -p /opt/quant-console
cd /opt/quant-console

if [ -d ".git" ]; then
  git pull origin main
else
  # 替换为你的 GitHub 仓库地址
  git clone https://github.com/DJ168168/quant-website.git .
fi

echo "====== [7/8] 安装依赖并构建 ======"
npm install --production=false
export DATABASE_URL="postgresql://quantuser:QuantPass2024!@localhost:5432/quantdb"
npm run build

echo "====== [8/8] 启动 PM2 服务 ======"
pm2 delete quant-console 2>/dev/null || true
pm2 start ecosystem.config.cjs --env production
pm2 save

echo ""
echo "====== 配置 Nginx ======"
cat > /etc/nginx/sites-available/quant-console << 'NGINX_EOF'
server {
    listen 80;
    server_name zhangyong.guru www.zhangyong.guru;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 300s;
        proxy_connect_timeout 75s;
    }
}
NGINX_EOF

ln -sf /etc/nginx/sites-available/quant-console /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

echo ""
echo "====== 申请 SSL 证书 (HTTPS) ======"
certbot --nginx -d zhangyong.guru -d www.zhangyong.guru --non-interactive --agree-tos --email mc678906@qq.com || echo "SSL 证书申请失败，稍后手动执行: certbot --nginx -d zhangyong.guru"

echo ""
echo "============================================================"
echo "  部署完成！"
echo "  访问: https://zhangyong.guru"
echo "  PM2 状态: pm2 status"
echo "  查看日志: pm2 logs quant-console"
echo "============================================================"
pm2 status
