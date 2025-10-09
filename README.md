# posn1exam

## Download

download `testhelper.js` and `package.json` from the lastest release

and place it in same folder

## Install

**For Windows 10/11 Powershell**

```powershell
Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
```

---

```bash
npm install
```

## Setup

create `testhelper.z.env`, at the same folder

```json
CMS_USERNAME=
CMS_PASSWORD=
CMS_BASE_URL=
```

## Usage

```bash
node start ./.cph/.cpp_file_name.prob
```
