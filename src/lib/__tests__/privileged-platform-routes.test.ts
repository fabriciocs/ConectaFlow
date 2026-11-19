import assert from "node:assert/strict";
import test from "node:test";
import * as settings from "@/app/api/settings/system/route";
import * as monitor from "@/app/api/system/monitor/route";
import * as user from "@/app/api/users/[id]/route";
import * as users from "@/app/api/users/route";

const params = { params: Promise.resolve({ id: "target-user" }) };
const operations = [
    { path: "/api/users", method: "GET", run: users.GET },
    { path: "/api/users", method: "POST", run: users.POST },
    { path: "/api/users/target-user", method: "PATCH", run: (request: Request) => user.PATCH(request, params) },
    { path: "/api/users/target-user", method: "DELETE", run: (request: Request) => user.DELETE(request, params) },
    { path: "/api/settings/system", method: "POST", run: settings.POST },
    { path: "/api/system/monitor", method: "GET", run: monitor.GET },
];

test("global platform operations reject both bearer credentials before evaluating the browser session", async () => {
    for (const { path, method, run } of operations) {
        for (const headers of [{ authorization: "Bearer example" }, { "x-api-key": "example" }] as HeadersInit[]) {
            const response = await run(new Request(`http://localhost${path}`, { method, headers }));
            assert.equal(response.status, 403, `${method} ${path}`);
            assert.deepEqual(await response.json(), { error: "browser_session_required" });
            assert.equal(response.headers.get("cache-control"), "no-store");
        }
    }
});

test("elevated settings reads reject bearer credentials", async () => {
    const response = await settings.GET(new Request("http://localhost/api/settings/system", {
        headers: { authorization: "Bearer example", "x-wa-akg-admin-reason": "Test access" },
    }));
    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), { error: "browser_session_required" });
});
