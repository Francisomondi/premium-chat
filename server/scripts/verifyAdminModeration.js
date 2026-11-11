
import readline from "node:readline";
import { stdin, stdout } from "node:process";

const API_BASE_URL =
  process.env.API_BASE_URL ||
  `http://localhost:${process.env.PORT || 5000}${process.env.API_PREFIX || "/api"}`;

const FRONTEND_ORIGIN =
  process.env.TEST_FRONTEND_ORIGIN || "http://localhost:5173";

function ask(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: stdin,
      output: stdout,
    });

    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

function askHidden(question) {
  if (!stdin.isTTY || typeof stdin.setRawMode !== "function") {
    throw new Error(
      "A terminal supporting hidden password input is required."
    );
  }

  stdout.write(question);

  return new Promise((resolve, reject) => {
    let password = "";

    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");

    const cleanup = () => {
      stdin.removeListener("data", handleInput);
      stdin.setRawMode(false);
      stdin.pause();
      stdout.write("\n");
    };

    const handleInput = (character) => {
      if (character === "\u0003") {
        cleanup();
        reject(new Error("Verification cancelled."));
        return;
      }

      if (character === "\r" || character === "\n") {
        cleanup();
        resolve(password);
        return;
      }

      if (character === "\u007f" || character === "\b") {
        password = password.slice(0, -1);
        return;
      }

      password += character;
    };

    stdin.on("data", handleInput);
  });
}

async function readResponse(response) {
  const text = await response.text();

  try {
    return JSON.parse(text);
  } catch {
    return { message: text || "No response body." };
  }
}

async function main() {
  console.log("\nPREMIUMCHAT ADMIN MODERATION VERIFICATION");
  console.log("-----------------------------------------");
  console.log(`API: ${API_BASE_URL}`);

  const email = await ask("Admin email: ");
  const password = await askHidden("Admin password: ");

  if (!email || !password) {
    throw new Error("Email and password are required.");
  }

  console.log("\nAuthenticating...");

  const loginResponse = await fetch(
    `${API_BASE_URL}/auth/login`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: FRONTEND_ORIGIN,
        Accept: "application/json",
      },
      body: JSON.stringify({ email, password }),
    }
  );

  const loginData = await readResponse(loginResponse);

  if (!loginResponse.ok) {
    console.error("Login failed:", loginResponse.status);
    console.error(loginData.message || loginData);
    process.exitCode = 1;
    return;
  }

  const setCookies = loginResponse.headers.getSetCookie?.() || [];

  const cookieHeader = setCookies
    .map((cookie) => cookie.split(";")[0])
    .filter(Boolean)
    .join("; ");

  if (!cookieHeader) {
    throw new Error(
      "Login succeeded, but no authentication cookie was returned."
    );
  }

  console.log("Authentication successful.");
  console.log("\nChecking admin moderation access...");

  const moderationResponse = await fetch(
    `${API_BASE_URL}/admin/media`,
    {
      method: "GET",
      headers: {
        Cookie: cookieHeader,
        Origin: FRONTEND_ORIGIN,
        Accept: "application/json",
      },
    }
  );

  const moderationData = await readResponse(moderationResponse);

  console.log("\nHTTP status:", moderationResponse.status);

  if (!moderationResponse.ok) {
    console.error("Moderation request failed:");
    console.error(moderationData);
    process.exitCode = 1;
    return;
  }

  const result = moderationData.data;

  console.log("\nADMIN MODERATION ACCESS VERIFIED");
  console.log("--------------------------------");
  console.log("Pending media:", result?.pagination?.total ?? "Unknown");
  console.log("Page:", result?.pagination?.page ?? "Unknown");

  console.table(
    (result?.media || []).map((item) => ({
      id: item.id,
      creatorId: item.creatorId,
      type: item.mediaType,
      status: item.status,
      moderation: item.moderationStatus,
      hasPreview: item.hasPreview,
    }))
  );

  console.log("\nRead-only verification completed.");
}

main().catch((error) => {
  console.error("\nVerification error:", error.message);
  process.exitCode = 1;
});
