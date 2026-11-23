# 行摄天工 SmartMap

Vue 地图、行程、发现、日记、个人中心与日记管理共用 Express 网关。PostgreSQL 保存账号、日记、媒体和社区互动。行程页支持地图选点和个人服务安排。

## Windows 部署

准备 Node.js 24、PostgreSQL 17、MinGW GCC 和专用空数据库。在应用环境设置 DB_HOST、DB_PORT、DB_USER、DB_NAME、DB_PASSWORD 和随机 JWT_SECRET（至少 32 字符）。PORT 默认 3000，网关固定绑定 127.0.0.1。ADMIN_USERNAME 和独立 ADMIN_PASSWORD 用于启用管理员登录。AI 写作、拍摄建议及动画需要服务端的 QWEN_API_KEY、MINIMAX_API_KEY，网络检索可选 TAVILY_API_KEY。

~~~powershell
npm ci
npm run build
gcc -O2 algo_server.c astar.c road_network.c multi_route.c style_recommend.c travel_time.c -lws2_32 -o algo_server.exe
gcc -O2 huffman_server.c huffman.c -lws2_32 -o huffman_server.exe
~~~

首次安装时使用数据库所有者的凭据，设置 SMARTMAP_MIGRATE=1，运行 node server.js 建表并退出，然后运行 node import-places.js 导入地点。由数据库管理员建立仅具 LOGIN 权限的 smartmap_web 角色、设置独立强密码，并执行 database/runtime-grants.sql。限制 PostgreSQL 仅监听回环地址并使用 SCRAM 认证。移除 SMARTMAP_MIGRATE，将运行环境的 DB_USER 和 DB_PASSWORD 切换至受限角色，将所有者凭据单独保管。最后在项目根目录分别启动两个 exe 和 npm start，通过本机网关端口打开网站。

## 地图数据

地点与餐饮从原项目北京 OpenStreetMap 快照提取，保留节点编号，路网沿用原项目道路。数据 © OpenStreetMap contributors，按 [Open Database License](https://www.openstreetmap.org/copyright) 提供。快照无法反映实时营业或路况。第三方图片的公网展示授权待核验。
