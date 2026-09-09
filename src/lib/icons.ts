import {
  CircleDot,
  Coins,
  Droplets,
  FlaskConical,
  Gem,
  Ghost,
  Shield,
  Skull,
  Sparkles,
  Sword,
  Swords,
  Wand2,
  type LucideIcon,
} from "lucide-react";
import type { ArtifactSlotId, HeroClassId, ResourceId } from "./game";

export const CLASS_ICONS: Record<HeroClassId, LucideIcon> = {
  blood_warrior: Swords,
  shadow_mage: Wand2,
  night_assassin: Ghost,
  necromancer: Skull,
  crimson_priest: Sparkles,
};

export const RESOURCE_ICONS: Record<ResourceId, LucideIcon> = {
  blood: Droplets,
  souls: Ghost,
  gold: Coins,
  essence: FlaskConical,
  shards: Gem,
};

export const SLOT_ICONS: Record<ArtifactSlotId, LucideIcon> = {
  weapon: Sword,
  armor: Shield,
  amulet: Gem,
  ring: CircleDot,
  rune: Sparkles,
};
