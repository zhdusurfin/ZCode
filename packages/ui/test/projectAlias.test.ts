import assert from "node:assert/strict";
import test from "node:test";
import {
  appSettingsPatchSchema,
  appSettingsSchema,
} from "../../shared/src/validationAppSettings.js";
import {
  PROJECT_ALIAS_MAX_LENGTH,
  resolveWorkspaceDisplayName,
  upsertProjectAlias,
} from "../src/lib/workspaceDisplayName.js";

// 项目别名：display-only 设置的归一化、单键合并与展示名解析。
// 归一化（trim / 控制字符 / 长度）通过 upsertProjectAlias 的落盘结果覆盖。

test("upsertProjectAlias normalizes draft: trim, control chars, length cap", () => {
  assert.deepEqual(upsertProjectAlias({}, "/repo", undefined, "  My Project  "), {
    "/repo": "My Project",
  });
  assert.deepEqual(upsertProjectAlias({}, "/repo", undefined, "a\u0000b\u001Fc\u007Fd"), {
    "/repo": "abcd",
  });
  const longAlias = upsertProjectAlias(
    {},
    "/repo",
    undefined,
    "x".repeat(PROJECT_ALIAS_MAX_LENGTH + 10),
  );
  assert.equal(longAlias["/repo"]?.length, PROJECT_ALIAS_MAX_LENGTH);
  assert.deepEqual(upsertProjectAlias({}, "/repo", undefined, " \t\n "), {});
});

test("upsertProjectAlias sets key by workspace identity fallback", () => {
  const next = upsertProjectAlias({}, "/repo", undefined, " Alias ");
  assert.deepEqual(next, { "/repo": "Alias" });

  const identityNext = upsertProjectAlias({}, "/repo", "ssh:host:22:dev", "Remote");
  assert.deepEqual(identityNext, { "ssh:host:22:dev": "Remote" });
});

test("upsertProjectAlias removes key on empty draft", () => {
  const current = { "/repo": "Alias", "/other": "Keep" };
  assert.deepEqual(upsertProjectAlias(current, "/repo", undefined, "   "), {
    "/other": "Keep",
  });
});

test("upsertProjectAlias removes key when draft is control characters only", () => {
  const current = { "ssh:host:22:dev": "Remote", "/other": "Keep" };
  assert.deepEqual(
    upsertProjectAlias(current, "/srv/app", "ssh:host:22:dev", "\u0000\u001F\u007F"),
    {
      "/other": "Keep",
    },
  );
});

test("upsertProjectAlias removes identity key without touching path key", () => {
  const current = { "/srv/app": "Local", "ssh:host:22:dev": "Remote" };
  assert.deepEqual(upsertProjectAlias(current, "/srv/app", "ssh:host:22:dev", ""), {
    "/srv/app": "Local",
  });
});

test("resolveWorkspaceDisplayName falls back to path leaf for whitespace label", () => {
  assert.equal(
    resolveWorkspaceDisplayName({
      workspacePath: "/repo/sub",
      label: "   ",
      aliases: {},
    }),
    "sub",
  );
});

test("upsertProjectAlias merges single key without clobbering others", () => {
  const current = { "/a": "A", "/b": "B" };
  const next = upsertProjectAlias(current, "/b", undefined, "B2");
  assert.deepEqual(next, { "/a": "A", "/b": "B2" });
  // 原 map 不被原地修改
  assert.deepEqual(current, { "/a": "A", "/b": "B" });
});

test("resolveWorkspaceDisplayName prefers alias then label then path leaf", () => {
  assert.equal(
    resolveWorkspaceDisplayName({
      workspacePath: "/repo/sub",
      aliases: { "/repo/sub": "My Alias" },
    }),
    "My Alias",
  );
  assert.equal(
    resolveWorkspaceDisplayName({
      workspacePath: "/repo/sub",
      label: "sub",
      aliases: {},
    }),
    "sub",
  );
  assert.equal(resolveWorkspaceDisplayName({ workspacePath: "C:\\work\\my-app" }), "my-app");
});

test("resolveWorkspaceDisplayName keys by workspaceIdentity over path", () => {
  const aliases = {
    "ssh:host:22:dev": "Prod Box",
  };
  assert.equal(
    resolveWorkspaceDisplayName({
      workspacePath: "/srv/app",
      workspaceIdentity: "ssh:host:22:dev",
      aliases,
    }),
    "Prod Box",
  );
  // 同路径、无 identity 的本地 workspace 不命中远端别名
  assert.equal(resolveWorkspaceDisplayName({ workspacePath: "/srv/app", aliases }), "app");
});

test("appSettingsSchema keeps projectAliases optional and typed", () => {
  const parsed = appSettingsSchema.parse({});
  assert.equal(parsed.projectAliases, undefined);

  const withAliases = appSettingsSchema.parse({
    projectAliases: { "/repo": "Alias" },
  });
  assert.deepEqual(withAliases.projectAliases, { "/repo": "Alias" });

  assert.throws(() => appSettingsPatchSchema.parse({ projectAliases: { "/repo": 1 } }));
});
