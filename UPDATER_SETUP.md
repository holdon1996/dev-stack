# DevStack Updater Setup

Tài liệu này ghi rõ cách tạo lại updater key, setup GitHub Secrets, build release, và cách updater native trong app đang được cấu hình.

## Tổng quan

App hiện đang có 2 chế độ:

- Native auto-update của Tauri: chỉ hoạt động khi lúc build có `TAURI_UPDATER_PUBKEY` và `TAURI_UPDATER_ENDPOINT`.
- Manual update fallback: nếu build không có 2 biến trên, app vẫn check GitHub Releases và mở trang tải bản mới.

Code hiện đang đọc 2 biến này bằng `option_env!`, nên đây là compile-time env vars. Nghĩa là chúng phải có sẵn trong GitHub Actions trước khi chạy build.

## 1. Tạo lại updater key

Chỉ tạo lại key nếu bạn chưa phát hành updater cho người dùng, hoặc bạn chấp nhận rằng các bản đã cài bằng key cũ sẽ không nhận được native update nữa.

### Xóa key cũ

Chạy trên PowerShell:

```powershell
Remove-Item "$HOME\.tauri\devstack.key" -Force -ErrorAction SilentlyContinue
Remove-Item "$HOME\.tauri\devstack.key.pub" -Force -ErrorAction SilentlyContinue
```

Nếu thư mục chưa tồn tại:

```powershell
New-Item -ItemType Directory -Force "$HOME\.tauri"
```

### Tạo key mới có password

```powershell
npm run tauri signer generate -- -w "$HOME\.tauri\devstack.key"
```

CLI sẽ hỏi:

```text
Please enter a password to protect the secret key.
Password:
Password (one more time):
```

Nhập password bạn muốn dùng để mã hóa private key.

### Kiểm tra key đã tạo

```powershell
Get-ChildItem "$HOME\.tauri\devstack.key*"
```

Lấy public key:

```powershell
Get-Content "$HOME\.tauri\devstack.key.pub"
```

Lấy private key:

```powershell
Get-Content "$HOME\.tauri\devstack.key"
```

## 2. GitHub cần setup gì

Vào repo GitHub:

`Settings` -> `Secrets and variables` -> `Actions` -> `New repository secret`

Tạo 3 secrets sau:

### `TAURI_SIGNING_PRIVATE_KEY`

Giá trị là nội dung file private key:

```powershell
Get-Content "$HOME\.tauri\devstack.key" -Raw
```

Copy toàn bộ nội dung đó vào secret.

### `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`

Giá trị là password bạn vừa nhập lúc generate key.

### `TAURI_UPDATER_PUBKEY`

Giá trị là nội dung file public key:

```powershell
Get-Content "$HOME\.tauri\devstack.key.pub" -Raw
```

Copy toàn bộ nội dung đó vào secret.

## 3. `TAURI_UPDATER_ENDPOINT` là gì và setup thế nào

Biến này là URL mà app sẽ dùng để check native updater.

Trong workflow đã tạo sẵn, mình đặt:

```text
https://github.com/<owner>/<repo>/releases/latest/download/latest.json
```

Với repo này nó sẽ trở thành:

```text
https://github.com/holdon1996/dev-stack/releases/latest/download/latest.json
```

Bạn không cần tạo secret riêng cho biến này nếu giữ nguyên workflow hiện tại, vì workflow đã set trực tiếp trong `env`.

Nếu sau này bạn muốn đổi sang CDN riêng hoặc update server riêng, sửa:

[`release.yml`](/f:/dev-stack/.github/workflows/release.yml)

dòng `TAURI_UPDATER_ENDPOINT`.

## 3.1. Vì sao local build báo thiếu `pubkey`

Tauri updater không chỉ đọc cấu hình ở runtime. Ngay lúc `tauri build`, bundler cũng sẽ parse:

- `plugins.updater.pubkey`
- `plugins.updater.endpoints`

trong:

[`tauri.conf.json`](/f:/dev-stack/src-tauri/tauri.conf.json)

Nếu thiếu `pubkey`, build sẽ dừng với lỗi kiểu:

```text
failed to parse updater plugin configuration: missing field `pubkey`
```

Vì vậy file config phải luôn có 2 trường này.

Hiện trong repo mình đã thêm sẵn:

```json
"updater": {
  "pubkey": "PASTE_YOUR_TAURI_UPDATER_PUBLIC_KEY_HERE",
  "endpoints": [
    "https://github.com/holdon1996/dev-stack/releases/latest/download/latest.json"
  ]
}
```

Việc bạn cần làm là thay:

`PASTE_YOUR_TAURI_UPDATER_PUBLIC_KEY_HERE`

bằng đúng nội dung file:

```powershell
Get-Content "$HOME\.tauri\devstack.key.pub" -Raw
```

Lưu ý:

- Đây là public key nên có thể commit vào repo.
- Không dùng path file ở đây.
- Phải là nội dung đầy đủ của public key trên một chuỗi string.

## 4. Build release local để test

Nếu muốn build local có updater native:

```powershell
$env:TAURI_SIGNING_PRIVATE_KEY = "$HOME\.tauri\devstack.key"
$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = "<password-của-bạn>"
$env:TAURI_UPDATER_PUBKEY = Get-Content "$HOME\.tauri\devstack.key.pub" -Raw
$env:TAURI_UPDATER_ENDPOINT = "https://github.com/holdon1996/dev-stack/releases/latest/download/latest.json"
npm run tauri build
```

Hoặc dùng script đã tạo sẵn:

[`set-updater-env.ps1`](/f:/dev-stack/scripts/set-updater-env.ps1)

```powershell
. .\scripts\set-updater-env.ps1
npm run tauri build
```

Nếu muốn truyền password trực tiếp:

```powershell
. .\scripts\set-updater-env.ps1 -Password "<password-của-bạn>"
npm run tauri build
```

Lưu ý:

- `TAURI_SIGNING_PRIVATE_KEY` dùng path hoặc content đều được, theo docs Tauri.
- `TAURI_UPDATER_PUBKEY` trong app hiện tại đang được nhúng vào lúc build, nên cần có trước `npm run tauri build`.
- `.env` không được Tauri dùng cho signing key trong lúc build release.
- Ngoài ra, trước khi build local bạn nên mở [`tauri.conf.json`](/f:/dev-stack/src-tauri/tauri.conf.json) và thay `pubkey` placeholder bằng public key thật.

## 5. Release trên GitHub

Workflow đã được tạo sẵn:

[`release.yml`](/f:/dev-stack/.github/workflows/release.yml)

Workflow này sẽ:

- chạy khi push tag dạng `v*`
- build bản Windows
- ký updater artifacts
- upload release assets lên GitHub Release
- tạo `latest.json` để native updater dùng

### Cách release

Cập nhật version trước:

- [`package.json`](/f:/dev-stack/package.json)
- [`src-tauri/Cargo.toml`](/f:/dev-stack/src-tauri/Cargo.toml)
- [`src-tauri/tauri.conf.json`](/f:/dev-stack/src-tauri/tauri.conf.json)

Nên để cùng một version, ví dụ `1.0.1`.

Sau đó tạo tag:

```powershell
git add .
git commit -m "release: v1.0.1"
git tag v1.0.1
git push origin main
git push origin v1.0.1
```

Khi workflow chạy xong, vào tab `Releases` trên GitHub để kiểm tra:

- có file installer `.exe` và/hoặc `.msi`
- có file `.sig`
- có file `latest.json`

## 6. App đang dùng updater như thế nào

Nếu build có đầy đủ biến updater:

- Settings sẽ hiện chế độ `Native auto-update`
- app có thể check, download, install update ngay trong app

Nếu build thiếu cấu hình updater:

- Settings sẽ hiện `Manual download`
- app vẫn check release mới nhất, nhưng sẽ mở trang tải về thay vì auto-install

## 7. Nguồn tham khảo chính thức

- Tauri updater guide: https://v2.tauri.app/plugin/updater/
- Tauri updater JS API: https://v2.tauri.app/reference/javascript/updater/
- tauri-plugin-updater README: https://docs.rs/crate/tauri-plugin-updater/latest/source/README.md
