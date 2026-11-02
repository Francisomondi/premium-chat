import "dotenv/config";

try {
  const raw = process.env.REDIS_URL?.trim();

  if (!raw) {
    console.log("REDIS_URL: MISSING");
    process.exitCode = 1;
  } else {
    const url = new URL(raw);

    console.log("Protocol:", url.protocol);
    console.log("Host:", url.hostname);
    console.log("Port:", url.port || "(default)");
    console.log("Username present:", Boolean(url.username));
    console.log("Password present:", Boolean(url.password));
  }
} catch (error) {
  console.log("REDIS_URL is invalid or malformed.");
  console.log("Error:", error.message);
}