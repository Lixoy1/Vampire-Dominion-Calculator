"use client";

import { useMemo, useState, useTransition } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Gem, Pencil, Plus, Search, ShieldQuestion, Trash2 } from "lucide-react";
import type { Artifact } from "@/db/schema";
import { ARTIFACT_SLOTS, RARITIES, rarityMeta, type ArtifactSlotId, type RarityId } from "@/lib/game";
import { SLOT_ICONS } from "@/lib/icons";
import { cn, fmt } from "@/lib/utils";
import { Badge, Button, Card, ConfirmButton, EmptyState, FadeIn, Field, Input, Modal, NumberStepper, Select } from "@/components/ui";
import { useToast } from "@/components/toast";
import { createArtifact, deleteArtifact, updateArtifact, type ArtifactInput } from "./actions";

const emptyForm: ArtifactInput = { name: "", slot: "weapon", rarity: "rare", attackBonus: 0, hpBonus: 0, defenseBonus: 0, speedBonus: 0, heroId: null };

function ArtifactForm({ initial, heroes, onSubmit, onCancel, pending }: { initial: ArtifactInput; heroes: { id: string; name: string }[]; onSubmit: (d: ArtifactInput) => void; onCancel: () => void; pending: boolean }) {
  const [form, setForm] = useState<ArtifactInput>(initial);
  const set = <K extends keyof ArtifactInput>(k: K, v: ArtifactInput[K]) => setForm((f) => ({ ...f, [k]: v }));
  const rarity = rarityMeta(form.rarity);
  return (
    <form className="flex flex-col gap-5" onSubmit={(e) => { e.preventDefault(); onSubmit(form); }}>
      <Field label="Название артефакта"><Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Например, Клык Каина" required maxLength={80} /></Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Слот"><Select value={form.slot} onChange={(e) => set("slot", e.target.value as ArtifactSlotId)}>{ARTIFACT_SLOTS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</Select></Field>
        <Field label="Редкость"><div className="flex h-10 flex-wrap items-center gap-1.5">{RARITIES.map((r) => <button key={r.id} type="button" onClick={() => set("rarity", r.id)} className={cn("rounded-lg border px-2.5 py-1.5 text-[11px] font-bold transition-all cursor-pointer", form.rarity === r.id ? "text-white" : "border-line text-smoke hover:text-ash")} style={form.rarity === r.id ? { borderColor: `${r.color}99`, backgroundColor: `${r.color}26`, color: r.color } : undefined}>{r.label}</button>)}</div></Field>
      </div>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Field label="+ Атака"><NumberStepper value={form.attackBonus} onChange={(v) => set("attackBonus", v)} min={0} max={999999} step={5} /></Field>
        <Field label="+ Здоровье"><NumberStepper value={form.hpBonus} onChange={(v) => set("hpBonus", v)} min={0} max={9999999} step={100} /></Field>
        <Field label="+ Защита"><NumberStepper value={form.defenseBonus} onChange={(v) => set("defenseBonus", v)} min={0} max={999999} step={5} /></Field>
        <Field label="+ Скорость"><NumberStepper value={form.speedBonus} onChange={(v) => set("speedBonus", v)} min={0} max={999} /></Field>
      </div>
      <Field label="Назначить герою" hint="необязательно"><Select value={form.heroId ?? ""} onChange={(e) => set("heroId", e.target.value || null)}><option value="">— В инвентаре —</option>{heroes.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}</Select></Field>
      <div className="rounded-xl border px-4 py-3 text-xs" style={{ borderColor: `${rarity.color}33`, backgroundColor: `${rarity.color}0a`, color: rarity.color }}>Редкость «{rarity.label}»: бонусы артефакта суммируются с характеристиками героя при расчёте силы.</div>
      <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={onCancel}>Отмена</Button><Button type="submit" loading={pending}>Сохранить артефакт</Button></div>
    </form>
  );
}

export function ArtifactsClient({ initialArtifacts, heroes }: { initialArtifacts: Artifact[]; heroes: { id: string; name: string }[] }) {
  const [items, setItems] = useState<Artifact[]>(initialArtifacts);
  const [query, setQuery] = useState("");
  const [slotFilter, setSlotFilter] = useState<ArtifactSlotId | "all">("all");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Artifact | null>(null);
  const [pending, startTransition] = useTransition();
  const toast = useToast();
  const heroName = (id: string | null) => heroes.find((h) => h.id === id)?.name ?? null;
  const filtered = useMemo(() => { const q = query.trim().toLowerCase(); return items.filter((a) => (slotFilter === "all" ? true : a.slot === slotFilter)).filter((a) => (q ? a.name.toLowerCase().includes(q) : true)).sort((a, b) => RARITIES.findIndex((r) => r.id === b.rarity) - RARITIES.findIndex((r) => r.id === a.rarity)); }, [items, query, slotFilter]);
  const handleSubmit = (form: ArtifactInput) => { startTransition(async () => { if (editing) { const prev = items; setItems((xs) => xs.map((x) => (x.id === editing.id ? { ...x, ...form } : x))); const res = await updateArtifact(editing.id, form); if (res.ok) { setItems((xs) => xs.map((x) => (x.id === editing.id ? res.data : x))); setModalOpen(false); toast.push("success", `Артефакт «${form.name}» обновлён`); } else { setItems(prev); toast.push("error", res.error); } } else { const temp: Artifact = { id: `temp-${crypto.randomUUID()}`, userId: "", createdAt: new Date(), ...form }; setItems((xs) => [temp, ...xs]); setModalOpen(false); const res = await createArtifact(form); if (res.ok) { setItems((xs) => xs.map((x) => (x.id === temp.id ? res.data : x))); toast.push("success", `«${form.name}» занесён в инвентарь`); } else { setItems((xs) => xs.filter((x) => x.id !== temp.id)); toast.push("error", res.error); } } }); };
  const handleDelete = (artifact: Artifact) => { const prev = items; setItems((xs) => xs.filter((x) => x.id !== artifact.id)); startTransition(async () => { const res = await deleteArtifact(artifact.id); if (res.ok) toast.push("info", `«${artifact.name}» уничтожен`); else { setItems(prev); toast.push("error", res.error); } }); };
  return (
    <div>
      <FadeIn className="mb-8 flex flex-wrap items-end justify-between gap-4"><div><h1 className="font-display text-xl font-bold uppercase tracking-[0.06em] text-bone sm:text-2xl">Артефакты</h1><p className="mt-1.5 text-sm text-ash">{items.length > 0 ? `${items.length} реликвий · ${items.filter((a) => a.heroId).length} назначено героям` : "Инвентарь пуст — добавьте первую реликвию"}</p></div><Button onClick={() => { setEditing(null); setModalOpen(true); }}><Plus size={15} /> Добавить артефакт</Button></FadeIn>
      {items.length > 0 && <FadeIn delay={0.08} className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center"><div className="relative flex-1 sm:max-w-xs"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-smoke" /><Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Поиск реликвии…" className="pl-9" /></div><div className="flex flex-wrap gap-1.5"><button onClick={() => setSlotFilter("all")} className={cn("rounded-full border px-3 py-1.5 text-xs font-semibold transition-all cursor-pointer", slotFilter === "all" ? "border-blood/50 bg-blood/15 text-blood-2" : "border-line text-ash hover:text-bone")}>Все слоты</button>{ARTIFACT_SLOTS.map((s) => <button key={s.id} onClick={() => setSlotFilter(s.id)} className={cn("rounded-full border px-3 py-1.5 text-xs font-semibold transition-all cursor-pointer", slotFilter === s.id ? "border-blood/50 bg-blood/15 text-blood-2" : "border-line text-ash hover:text-bone")}>{s.label}</button>)}</div></FadeIn>}
      {items.length === 0 ? <EmptyState icon={<ShieldQuestion size={28} />} title="Склеп реликвий пуст" description="Добавляйте артефакты из игры, отслеживайте их бонусы и назначайте героям ковена." action={<Button onClick={() => { setEditing(null); setModalOpen(true); }}><Plus size={15} /> Добавить артефакт</Button>} /> : filtered.length === 0 ? <EmptyState icon={<Search size={28} />} title="Ничего не найдено" description="Попробуйте другой запрос или сбросьте фильтр слотов." action={<Button variant="secondary" onClick={() => { setQuery(""); setSlotFilter("all"); }}>Сбросить фильтры</Button>} /> : (
        <motion.div layout className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3"><AnimatePresence mode="popLayout">{filtered.map((a) => { const rarity = rarityMeta(a.rarity); const SlotIcon = SLOT_ICONS[a.slot]; const owner = heroName(a.heroId); return <motion.div key={a.id} layout initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.94, transition: { duration: 0.18 } }} transition={{ type: "spring", damping: 26, stiffness: 300 }}><Card className="group relative h-full overflow-hidden p-5 transition-all duration-300 hover:-translate-y-1"><div className="pointer-events-none absolute inset-x-0 top-0 h-[3px]" style={{ background: `linear-gradient(90deg, transparent, ${rarity.color}, transparent)` }} /><div className="flex items-start gap-3"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl" style={{ color: rarity.color, backgroundColor: `${rarity.color}14`, boxShadow: `inset 0 0 0 1px ${rarity.color}33, 0 0 20px ${rarity.color}22` }}><SlotIcon size={20} /></span><div className="min-w-0 flex-1"><h3 className="truncate font-display text-sm font-semibold text-bone">{a.name}</h3><p className="mt-0.5 text-[11px] text-smoke">{ARTIFACT_SLOTS.find((s) => s.id === a.slot)?.label}{owner ? ` · ${owner}` : " · в инвентаре"}</p></div><Badge color={rarity.color}>{rarity.label}</Badge></div><div className="mt-4 flex flex-wrap gap-1.5">{a.attackBonus > 0 && <span className="rounded-md bg-blood/10 px-2 py-1 text-[11px] font-semibold tabular-nums text-blood-2">АТК +{fmt(a.attackBonus)}</span>}{a.hpBonus > 0 && <span className="rounded-md bg-[#4ade80]/10 px-2 py-1 text-[11px] font-semibold tabular-nums text-[#4ade80]">ЗДР +{fmt(a.hpBonus)}</span>}{a.defenseBonus > 0 && <span className="rounded-md bg-[#38bdf8]/10 px-2 py-1 text-[11px] font-semibold tabular-nums text-[#38bdf8]">ЗАЩ +{fmt(a.defenseBonus)}</span>}{a.speedBonus > 0 && <span className="rounded-md bg-gold/10 px-2 py-1 text-[11px] font-semibold tabular-nums text-gold">СКР +{fmt(a.speedBonus)}</span>}</div><div className="mt-4 flex items-center justify-end gap-2 border-t border-line/60 pt-3"><button onClick={() => { setEditing(a); setModalOpen(true); }} className="rounded-lg border border-line p-2 text-ash transition-colors hover:border-blood/40 hover:text-bone cursor-pointer" title="Редактировать"><Pencil size={14} /></button><ConfirmButton onConfirm={() => handleDelete(a)} size="sm" confirmChildren="Точно?"><Trash2 size={14} /></ConfirmButton></div></Card></motion.div>; })}</AnimatePresence></motion.div>
      )}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? `Редактировать: ${editing.name}` : "Новая реликвия"} subtitle="Бонусы указываются из описания артефакта в игре"><ArtifactForm key={editing?.id ?? "new"} initial={editing ? { name: editing.name, slot: editing.slot, rarity: editing.rarity, attackBonus: editing.attackBonus, hpBonus: editing.hpBonus, defenseBonus: editing.defenseBonus, speedBonus: editing.speedBonus, heroId: editing.heroId } : emptyForm} heroes={heroes} pending={pending} onCancel={() => setModalOpen(false)} onSubmit={handleSubmit} /></Modal>
    </div>
  );
}
