import { chromium } from "playwright";
import path from "path";

(async () => {
    // Create a browser context with a custom base URL.
    const browser = await chromium.launch();
    const context = await browser.newContext({
        baseURL: "http://example.com",
    });
    await context.route("**/*", (route, request) =>
        route.fulfill({ path: path.join(__dirname, "dist", new URL(request.url()).pathname) })
    );
    const page = await context.newPage();

    await page.goto("/index.html");

    // Wait for the smoke success message in the console.
    page.on("console", async (msg) => {
        console.log(msg.type(), msg.text());
        if (msg.type() === "log" && msg.text().includes("SMOKE SUCCESS")) {
            await browser.close();
            process.exit(0);
        }
    });

    // Error if we don't get the success message in 10 seconds.
    setTimeout(() => {
        console.error("SMOKE TEST FAILED");
        process.exit(1);
    }, 10000);
})();
