# Setup — VDT WebRTC

Hướng dẫn cài đặt và chạy dự án ở môi trường dev và bằng Docker Compose.

## Yêu cầu (prerequisites)

| Công cụ | Phiên bản | Dùng cho |
|---------|-----------|----------|
| JDK (Temurin) | **21** | Backend (Spring Boot) |
| Node.js | **22 LTS** | Frontend (Vite) — chỉ dev/build |
| Docker + Docker Compose | mới nhất | Postgres, chạy full-stack, test (Testcontainers) |
| Maven | dùng wrapper `mvnw` (không cần cài) | Build backend |

## Cấu hình biến môi trường

```bash
cp .env.example .env
```
Sửa `.env` (đặc biệt `POSTGRES_PASSWORD` và `JWT_SECRET` — secret nên ≥ 32 ký tự, tạo bằng `openssl rand -base64 48`). File `.env` đã được `.gitignore`, **không commit**.

| Biến | Ý nghĩa |
|------|---------|
| `POSTGRES_DB` / `POSTGRES_USER` / `POSTGRES_PASSWORD` | DB Postgres |
| `DB_URL` / `DB_USERNAME` / `DB_PASSWORD` | Datasource backend |
| `JWT_SECRET` | Secret ký JWT (HS512) |
| `JWT_ACCESS_TTL_MS` | TTL access token (mặc định 1h dev) |
| `COOKIE_SECURE` | `false` ở dev (HTTP), đặt `true` ở prod (HTTPS) |

## Cách 1 — Chạy full-stack bằng Docker Compose (nhanh nhất)

```bash
docker compose up --build
```
Khởi động:
- **postgres** (`postgres:17-alpine`) — host port `5433` → container `5432`
- **backend** (Spring Boot) — http://localhost:8080

Flyway tự chạy migration (`V1__create_tables`, `V2__seed_admin`) khi backend khởi động.

> Frontend chưa nằm trong Compose (sẽ thêm ở phase sau) — chạy riêng theo mục dưới.

## Cách 2 — Dev hot-reload

**Postgres** (chỉ DB qua Compose):
```bash
docker compose up postgres        # expose host 5433
```

**Backend** (kết nối tới Postgres ở 5433):
```bash
cd backend
DB_URL=jdbc:postgresql://localhost:5433/vdt_webrtc ./mvnw spring-boot:run
```
hoặc chạy `WebrtcApplication` trong IDE (đặt env `DB_URL`, `DB_USERNAME`, `DB_PASSWORD`, `JWT_SECRET`).

**Frontend** (Vite dev server, http://localhost:5173):
```bash
cd frontend
npm install
npm run dev
```
`frontend/.env` trỏ `VITE_API_URL=http://localhost:8080`.

## Tài khoản seed

Migration `V2` tạo sẵn 1 admin để demo:

| Username | Password | Role |
|----------|----------|------|
| `admin`  | `Admin@123` | ADMIN |

> ⚠️ Chỉ dùng cho dev/demo. **Đổi mật khẩu trước khi lên production.**

## Database migrations (Flyway)

- Vị trí: `backend/src/main/resources/db/migration/`
- `V1__create_tables.sql` — bảng `users`, `refresh_tokens`
- `V2__seed_admin.sql` — seed admin
- Chạy **tự động** khi backend khởi động. `ddl-auto: validate` — Flyway sở hữu schema, Hibernate chỉ kiểm khớp.

## REST API (hiện có — Phase 1)

| Method | Endpoint | Mô tả | Auth |
|--------|----------|-------|------|
| POST | `/api/auth/register` | Đăng ký | công khai |
| POST | `/api/auth/login` | Đăng nhập → access token + cookie refresh | công khai |
| POST | `/api/auth/refresh` | Xoay refresh token (httpOnly cookie) | cookie |
| POST | `/api/auth/logout` | Thu hồi token + xoá cookie | cookie |
| GET  | `/api/users/me` | Thông tin user hiện tại | Bearer token |
| GET  | `/api/admin/users` | Danh sách user | Bearer token (ADMIN) |
| GET  | `/actuator/health` | Health check | công khai |

## Chạy test

```bash
cd backend
./mvnw test                              # tất cả test (cần Docker bật — Testcontainers)
./mvnw test -Dtest=AuthControllerTest    # chỉ test auth
```
> Test dùng **Testcontainers** → spin Postgres thật trong Docker. **Docker phải đang chạy.**

Frontend lint/build:
```bash
cd frontend
npm run lint
npm run build
```

## Phase 3: HTTPS, coturn & gọi 2 thiết bị

Cuộc gọi 1-1 trên **1 máy / 2 tab (localhost)** chạy ngay không cần phần này.
Phần dưới chỉ cần khi demo trên **2 thiết bị thật qua LAN** và/hoặc chứng minh **TURN relay**.

### 1. HTTPS bằng mkcert (để getUserMedia chạy trên thiết bị thứ 2)

Trình duyệt chặn camera trên `http://<IP>` (chỉ cho localhost) → cần HTTPS.

```bash
# Cài mkcert (Windows: choco install mkcert  | Linux: apt install libnss3-tools && tải mkcert)
mkcert -install            # cài CA local vào trust store

# Cert cho frontend (Vite). Thay 192.168.1.100 = IP LAN máy bạn (ipconfig / ip addr)
cd frontend && mkdir -p certs
mkcert -key-file certs/localhost-key.pem -cert-file certs/localhost.pem localhost 127.0.0.1 192.168.1.100

# Cert cho backend (Spring, PKCS12). Mật khẩu file mặc định: changeit
cd ../backend/src/main/resources && mkdir -p certs
mkcert -pkcs12 -p12-file certs/backend.p12 localhost 127.0.0.1 192.168.1.100
```
Cert đã **gitignore** (không commit). Có cert → Vite tự bật HTTPS. Backend bật HTTPS khi chạy profile `dev`:
```bash
cd backend && ./mvnw spring-boot:run -Dspring-boot.run.profiles=dev
```
Frontend: tạo `frontend/.env.local` (gitignored) trỏ `VITE_API_URL=https://<IP>:8080`, `VITE_WS_URL=wss://<IP>:8080/ws`.
Thiết bị thứ 2: cài CA mkcert (chạy `mkcert -CAROOT` để lấy file CA) hoặc chấp nhận cert, rồi mở `https://<IP>:5173`.

### 2. coturn (TURN server) cho NAT khó

```bash
# Trong .env (gốc), đặt (TURN_SECRET phải GIỐNG turn.secret backend):
#   TURN_SECRET=$(openssl rand -hex 32)
#   HOST_IP=192.168.1.100
#   TURN_SERVER=192.168.1.100:3478
docker compose up coturn          # Linux: network_mode host. Windows/Mac: bỏ comment khối ports.
```
coturn xác thực bằng credential tạm từ `GET /api/turn-credentials` (HMAC-SHA1, không có mật khẩu tĩnh nào tới trình duyệt).

### 3. Test forced-relay (chứng minh TURN thật sự relay)

1. Đặt cuộc gọi bình thường → mở debug panel (nút ⚙) → ICE thường là `host`/`srflx` (cùng LAN).
2. Mở app với `?relay=1` (vd `https://<IP>:5173/?relay=1`) → đặt cuộc gọi mới → ICE phải là **`relay`** = media đi qua coturn.

