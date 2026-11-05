import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const PORT = 4056;
const BASE = `http://127.0.0.1:${PORT}`;

async function main() {
  const serverDir = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
  );
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "pacecar-upload-test-"));
  const dbFile = path.join(tempDir, "db.json");

  const proc = spawn(process.execPath, ["src/index.js"], {
    cwd: serverDir,
    env: {
      ...process.env,
      PORT: String(PORT),
      PACECAR_DB_FILE: dbFile,
      PACECAR_UPLOAD_DIR: path.join(tempDir, "uploads"),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  proc.stdout.on("data", (d) => process.stdout.write(d));
  proc.stderr.on("data", (d) => process.stderr.write(d));

  try {
    for (let i = 0; i < 30; i++) {
      try {
        const res = await fetch(`${BASE}/api/health`);
        if (res.ok) break;
      } catch {}
      await new Promise((r) => setTimeout(r, 200));
    }

    // Login as owner (user 6)
    const ownerRes = await fetch(`${BASE}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "linh@pacecar.vn", password: "123456" }),
    });
    const owner = await ownerRes.json();

    // 1. Test 10MB upload (larger than old 5MB/8MB limit, but under 50MB) -> MUST SUCCEED
    console.log("Testing 10MB file upload (under 50MB limit)...");
    const tenMbBuffer = Buffer.alloc(10 * 1024 * 1024, 0);
    const form10 = new FormData();
    form10.append("files", new Blob([tenMbBuffer], { type: "image/jpeg" }), "large-car.jpg");

    const upload10Res = await fetch(`${BASE}/api/uploads/cars`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${owner.token}`,
      },
      body: form10,
    });
    if (upload10Res.status !== 201) {
      throw new Error(`Upload 10MB failed: ${await upload10Res.text()}`);
    }
    const upload10Json = await upload10Res.json();
    assert.equal(upload10Json.files.length, 1);
    console.log("✓ 10MB file uploaded successfully!");

    // 2. Test 51MB upload (over 50MB limit) -> MUST RETURN 413
    console.log("Testing 51MB file upload (over 50MB limit)...");
    const fiftyOneMbBuffer = Buffer.alloc(51 * 1024 * 1024, 0);
    const form51 = new FormData();
    form51.append("files", new Blob([fiftyOneMbBuffer], { type: "image/jpeg" }), "too-large-car.jpg");

    const upload51Res = await fetch(`${BASE}/api/uploads/cars`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${owner.token}`,
      },
      body: form51,
    });
    assert.equal(upload51Res.status, 413);
    const upload51Json = await upload51Res.json();
    assert.match(upload51Json.message, /vượt quá dung lượng cho phép/);
    console.log("✓ 51MB file rejected with 413 LIMIT_FILE_SIZE error message as expected!");

    console.log("\nALL UPLOAD SIZE TESTS PASSED!");
  } finally {
    proc.kill();
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  }
}

main().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
