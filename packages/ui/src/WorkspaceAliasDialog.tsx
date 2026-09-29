import { memo, useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog.js";
import { Button } from "@/components/ui/button.js";
import { Input } from "@/components/ui/input.js";
import { useProjectAliases } from "@/hooks/useSettingService.js";
import { getWorkspaceKey } from "@/lib/workspaceKey.js";
import { PROJECT_ALIAS_MAX_LENGTH } from "@/lib/workspaceDisplayName.js";
import { logger } from "@/logger.js";
import { TID_WORKSPACE_ALIAS_INPUT, TID_WORKSPACE_ALIAS_SAVE } from "@zcode/shared";
import type { WorkspaceTabState } from "@/store/tabStore.js";

/**
 * 项目别名弹窗：为 workspace 设置 display-only 别名。
 * 提交统一走 useProjectAliases().setProjectAlias（读最新 settings 合并单键），
 * 失败时保留弹窗和草稿，由用户重试或取消。
 */
export const WorkspaceAliasDialog = memo(function WorkspaceAliasDialog({
  tab,
  open,
  onOpenChange,
}: {
  tab: Pick<WorkspaceTabState, "workspacePath" | "workspaceIdentity" | "label">;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { intl } = useZCodeIntl();
  const { aliases, setProjectAlias } = useProjectAliases();
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const workspaceKey = getWorkspaceKey(tab.workspacePath, tab.workspaceIdentity);
  const currentAlias = aliases?.[workspaceKey]?.trim() ?? "";

  // 每次打开都以当前已保存别名重置草稿，避免上次的未提交输入串台。
  useEffect(() => {
    if (open) {
      setDraft(currentAlias);
      setError(null);
      setPending(false);
    }
    // currentAlias 刻意在依赖外读取：打开瞬间取值即可，保存后别名变化不该重算已打开的草稿。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, workspaceKey]);

  const handleSubmit = useCallback(
    async (event: FormEvent) => {
      event.preventDefault();
      if (pending) {
        return;
      }
      setPending(true);
      setError(null);
      try {
        // 空草稿在 upsertProjectAlias 内归一化为删除键，等价于「清除别名」。
        await setProjectAlias(tab.workspacePath, tab.workspaceIdentity, draft);
        logger.info("[WorkspaceAliasDialog] 项目别名已保存", { workspaceKey });
        onOpenChange(false);
      } catch (err) {
        logger.error("[WorkspaceAliasDialog] 保存项目别名失败:", err);
        setError(intl.formatMessage({ id: "workspaceSidebar.renameFailed" }));
      } finally {
        setPending(false);
      }
    },
    [
      draft,
      intl,
      onOpenChange,
      pending,
      setProjectAlias,
      tab.workspaceIdentity,
      tab.workspacePath,
      workspaceKey,
    ],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        aria-describedby={undefined}
        className="w-[min(440px,calc(100vw-2rem))] max-w-none gap-5"
      >
        <DialogTitle className="min-w-0 truncate pr-8 text-ui-lg font-medium text-foreground">
          {intl.formatMessage({ id: "workspaceSidebar.renameTitle" })}
        </DialogTitle>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex min-w-0 flex-col gap-1">
            <span className="truncate text-ui-base text-foreground">{tab.label}</span>
            <span
              className="truncate font-mono text-ui-xs text-foreground-subtle"
              title={tab.workspacePath}
            >
              {tab.workspacePath}
            </span>
          </div>
          <label className="flex min-w-0 flex-col gap-1.5">
            <span className="text-ui-sm text-foreground-subtle">
              {intl.formatMessage({ id: "workspaceSidebar.renameLabel" })}
            </span>
            <Input
              ref={inputRef}
              data-testid={TID_WORKSPACE_ALIAS_INPUT}
              value={draft}
              maxLength={PROJECT_ALIAS_MAX_LENGTH}
              placeholder={intl.formatMessage({ id: "workspaceSidebar.renamePlaceholder" })}
              onChange={(event) => setDraft(event.target.value)}
              autoFocus
            />
            <span className="text-ui-xs text-foreground-subtle">
              {intl.formatMessage({ id: "workspaceSidebar.renameHint" })}
            </span>
          </label>
          {error ? <p className="text-ui-sm text-destructive">{error}</p> : null}
          <div className="flex items-center justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
              {intl.formatMessage({ id: "common.cancel" })}
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={pending}
              data-testid={TID_WORKSPACE_ALIAS_SAVE}
            >
              {intl.formatMessage({ id: "common.save" })}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
});
