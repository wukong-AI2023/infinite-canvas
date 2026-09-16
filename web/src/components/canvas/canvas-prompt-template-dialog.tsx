import { useEffect, useMemo, useState, type ReactNode } from "react";
import { App, Button, Input, Modal, Popconfirm, Select } from "antd";
import { Clapperboard, Folder, Grid3x3, Plus, SunMedium, Trash2, UserRound } from "lucide-react";
import { useTranslation } from "react-i18next";

import { canvasThemes } from "@/lib/canvas-theme";
import { CUSTOM_PROMPT_TEMPLATE_GROUP_ID } from "@/lib/prompt-template-seed";
import { fallbackTemplateGroupId, formatTemplatePrompt, templateMatchesQuery } from "@/lib/prompt-templates";
import { usePromptTemplateStore } from "@/stores/use-prompt-template-store";
import { useThemeStore } from "@/stores/use-theme-store";

export function PromptTemplateGroupIcon({ groupId, className }: { groupId: string; className?: string }) {
    const Icon = groupId === "camera" ? Grid3x3 : groupId === "story" ? Clapperboard : groupId === "sheet" ? UserRound : groupId === "look" ? SunMedium : Folder;
    return <Icon className={className || "size-3.5"} />;
}

export function CanvasPromptTemplateDialog({
    open,
    selectedId,
    onSelectId,
    onClose,
    onApply,
}: {
    open: boolean;
    selectedId: string | null;
    onSelectId: (id: string | null) => void;
    onClose: () => void;
    onApply: (prompt: string) => void;
}) {
    const { t } = useTranslation();
    const { message } = App.useApp();
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const groups = usePromptTemplateStore((state) => state.groups);
    const items = usePromptTemplateStore((state) => state.items);
    const updateTemplate = usePromptTemplateStore((state) => state.updateTemplate);
    const addTemplate = usePromptTemplateStore((state) => state.addTemplate);
    const removeTemplate = usePromptTemplateStore((state) => state.removeTemplate);
    const addGroup = usePromptTemplateStore((state) => state.addGroup);
    const renameGroup = usePromptTemplateStore((state) => state.renameGroup);
    const removeGroup = usePromptTemplateStore((state) => state.removeGroup);
    const [keyword, setKeyword] = useState("");
    const [groupFilter, setGroupFilter] = useState("all");
    const [groupsOpen, setGroupsOpen] = useState(false);

    const visibleItems = useMemo(() => {
        return items.filter((item) => {
            if (groupFilter !== "all" && item.groupId !== groupFilter) return false;
            return templateMatchesQuery(item, keyword);
        });
    }, [groupFilter, items, keyword]);

    const selected = items.find((item) => item.id === selectedId) || visibleItems[0] || items[0] || null;

    useEffect(() => {
        if (!open || !selected || selected.id === selectedId) return;
        onSelectId(selected.id);
    }, [open, selected, selectedId, onSelectId]);
    const fallbackGroupName = groups.find((group) => group.id === fallbackTemplateGroupId(groups, CUSTOM_PROMPT_TEMPLATE_GROUP_ID))?.name || t("canvas.promptTemplates.untitledGroup");

    const applySelected = () => {
        if (!selected) return;
        const prompt = formatTemplatePrompt(selected);
        if (!prompt) return;
        onApply(prompt);
    };

    return (
        <>
            <Modal
                title={t("canvas.promptTemplates.manageTitle")}
                open={open}
                onCancel={onClose}
                footer={null}
                width={840}
                centered
                destroyOnHidden
            >
                <div data-canvas-no-zoom className="flex h-[70vh] min-h-[480px] overflow-hidden rounded-xl border" style={{ borderColor: theme.toolbar.border, color: theme.node.text }} onWheel={(event) => event.stopPropagation()}>
                    <div className="flex w-[280px] shrink-0 flex-col border-r" style={{ borderColor: theme.toolbar.border }}>
                        <div className="space-y-2 p-3">
                            <Input
                                size="small"
                                allowClear
                                value={keyword}
                                placeholder={t("canvas.promptTemplates.search")}
                                onChange={(event) => setKeyword(event.target.value)}
                            />
                            <div className="flex flex-wrap gap-1">
                                <GroupChip active={groupFilter === "all"} label={t("common.all")} theme={theme} onClick={() => setGroupFilter("all")} />
                                {groups.map((group) => (
                                    <GroupChip key={group.id} active={groupFilter === group.id} label={group.name} theme={theme} onClick={() => setGroupFilter(group.id)} />
                                ))}
                            </div>
                            <div className="flex items-center justify-between gap-2">
                                <button type="button" className="text-xs hover:underline" style={{ color: theme.node.muted }} onClick={() => setGroupsOpen(true)}>
                                    {t("canvas.promptTemplates.groups")}
                                </button>
                                <Button
                                    type="text"
                                    size="small"
                                    className="!h-7 !bg-transparent !px-2 hover:!bg-black/5 dark:hover:!bg-white/10"
                                    icon={<Plus className="size-3.5" />}
                                    style={{ color: theme.node.text }}
                                    onClick={() => {
                                        const id = addTemplate({
                                            name: t("canvas.promptTemplates.untitled"),
                                            groupId: groupFilter === "all" ? CUSTOM_PROMPT_TEMPLATE_GROUP_ID : groupFilter,
                                            positive: "",
                                        });
                                        onSelectId(id);
                                    }}
                                >
                                    {t("canvas.promptTemplates.newTemplate")}
                                </Button>
                            </div>
                        </div>
                        <div className="thin-scrollbar min-h-0 flex-1 overflow-y-auto px-2 pb-3">
                            {visibleItems.length ? visibleItems.map((item) => {
                                const active = selected?.id === item.id;
                                return (
                                    <button
                                        key={item.id}
                                        type="button"
                                        className="mb-1 flex h-[54px] w-full items-center gap-2 rounded-lg px-2 text-left"
                                        style={active ? { background: theme.toolbar.activeBg, color: theme.toolbar.activeText } : { color: theme.node.text }}
                                        onClick={() => onSelectId(item.id)}
                                    >
                                        <PromptTemplateGroupIcon groupId={item.groupId} className="size-3.5 shrink-0" />
                                        <span className="min-w-0">
                                            <span className="block truncate text-sm">{item.name || t("canvas.promptTemplates.untitled")}</span>
                                        </span>
                                    </button>
                                );
                            }) : (
                                <div className="px-2 py-6 text-center text-xs" style={{ color: theme.node.muted }}>
                                    {t("canvas.promptTemplates.noMatch")}
                                </div>
                            )}
                        </div>
                    </div>
                    <div className="flex min-w-0 flex-1 flex-col">
                        {selected ? (
                            <>
                                <div className="thin-scrollbar min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
                                    <Field label={t("canvas.promptTemplates.name")}>
                                        <Input value={selected.name} onChange={(event) => updateTemplate(selected.id, { name: event.target.value })} />
                                    </Field>
                                    <Field label={t("canvas.promptTemplates.group")}>
                                        <Select
                                            className="w-full"
                                            value={selected.groupId}
                                            options={groups.map((group) => ({ value: group.id, label: group.name }))}
                                            onChange={(groupId) => updateTemplate(selected.id, { groupId })}
                                        />
                                    </Field>
                                    <Field label={t("canvas.promptTemplates.scene")}>
                                        <Input.TextArea
                                            className="thin-scrollbar"
                                            value={selected.scene}
                                            autoSize={{ minRows: 2 }}
                                            onChange={(event) => updateTemplate(selected.id, { scene: event.target.value })}
                                        />
                                    </Field>
                                    <Field label={t("canvas.promptTemplates.caption")}>
                                        <Input value={selected.caption} onChange={(event) => updateTemplate(selected.id, { caption: event.target.value })} />
                                    </Field>
                                    <Field label={t("canvas.promptTemplates.prompt")}>
                                        <Input.TextArea
                                            className="thin-scrollbar"
                                            value={selected.positive}
                                            autoSize={{ minRows: 3 }}
                                            onChange={(event) => updateTemplate(selected.id, { positive: event.target.value })}
                                        />
                                    </Field>
                                    <Field label={t("canvas.promptTemplates.negative")}>
                                        <Input.TextArea
                                            className="thin-scrollbar"
                                            value={selected.negative || ""}
                                            autoSize={{ minRows: 3, maxRows: 8 }}
                                            onChange={(event) => updateTemplate(selected.id, { negative: event.target.value })}
                                        />
                                    </Field>
                                    {selected.params && Object.keys(selected.params).length ? (
                                        <Field label={t("canvas.promptTemplates.params")}>
                                            <div className="space-y-1 text-xs" style={{ color: theme.node.muted }}>
                                                {Object.entries(selected.params).map(([key, value]) => (
                                                    <div key={key}>
                                                        <span className="mr-2 font-medium" style={{ color: theme.node.text }}>{key}</span>
                                                        <span>{value}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </Field>
                                    ) : null}
                                </div>
                                <div className="flex justify-end gap-2 border-t px-4 py-3" style={{ borderColor: theme.toolbar.border }}>
                                    <Popconfirm
                                        title={t("canvas.promptTemplates.deleteTemplate")}
                                        okText={t("common.delete")}
                                        cancelText={t("common.cancel")}
                                        onConfirm={() => {
                                            const next = items.find((item) => item.id !== selected.id);
                                            removeTemplate(selected.id);
                                            onSelectId(next?.id || null);
                                        }}
                                    >
                                        <Button type="text" className="!bg-transparent hover:!bg-black/5 dark:hover:!bg-white/10" icon={<Trash2 className="size-3.5" />} style={{ color: theme.node.text }}>
                                            {t("common.delete")}
                                        </Button>
                                    </Popconfirm>
                                    <Button type="primary" onClick={applySelected} disabled={!formatTemplatePrompt(selected)}>
                                        {t("canvas.promptTemplates.apply")}
                                    </Button>
                                </div>
                            </>
                        ) : (
                            <div className="grid flex-1 place-items-center text-sm" style={{ color: theme.node.muted }}>
                                {t("canvas.promptTemplates.empty")}
                            </div>
                        )}
                    </div>
                </div>
            </Modal>
            <Modal
                title={t("canvas.promptTemplates.groups")}
                open={groupsOpen}
                onCancel={() => setGroupsOpen(false)}
                footer={null}
                width={420}
                centered
                destroyOnHidden
            >
                <div className="space-y-2" data-canvas-no-zoom>
                    {groups.map((group) => (
                        <div key={group.id} className="flex items-center gap-2">
                            <Input value={group.name} onChange={(event) => renameGroup(group.id, event.target.value)} />
                            <Popconfirm
                                title={t("canvas.promptTemplates.deleteGroup", { name: fallbackGroupName })}
                                okText={t("common.delete")}
                                cancelText={t("common.cancel")}
                                onConfirm={() => {
                                    if (groups.length <= 1) {
                                        message.warning(t("canvas.promptTemplates.lastGroup"));
                                        return;
                                    }
                                    removeGroup(group.id);
                                    if (groupFilter === group.id) setGroupFilter("all");
                                }}
                            >
                                <Button type="text" className="!bg-transparent hover:!bg-black/5 dark:hover:!bg-white/10" icon={<Trash2 className="size-3.5" />} aria-label={t("common.delete")} />
                            </Popconfirm>
                        </div>
                    ))}
                    <Button
                        type="text"
                        className="!bg-transparent hover:!bg-black/5 dark:hover:!bg-white/10"
                        icon={<Plus className="size-3.5" />}
                        onClick={() => addGroup(t("canvas.promptTemplates.untitledGroup"))}
                    >
                        {t("canvas.promptTemplates.addGroup")}
                    </Button>
                </div>
            </Modal>
        </>
    );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
    return (
        <label className="block space-y-1.5">
            <span className="text-xs" style={{ color: "inherit", opacity: 0.7 }}>{label}</span>
            {children}
        </label>
    );
}

function GroupChip({ active, label, theme, onClick }: { active: boolean; label: string; theme: (typeof canvasThemes)[keyof typeof canvasThemes]; onClick: () => void }) {
    return (
        <button
            type="button"
            className="rounded-full px-2.5 py-1 text-xs"
            style={active ? { background: theme.toolbar.activeBg, color: theme.toolbar.activeText } : { color: theme.node.muted }}
            onClick={onClick}
        >
            {label}
        </button>
    );
}
