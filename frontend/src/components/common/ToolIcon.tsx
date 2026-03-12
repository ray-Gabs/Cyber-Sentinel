import {
  Bug,
  Search,
  Radar,
  Atom,
  Lock,
  Globe,
  Database,
  Zap,
  Unlock,
  ExternalLink,
  KeyRound,
  Crosshair,
  Swords,
  Sparkles,
  Wrench,
  type LucideProps,
} from "lucide-react";

const iconMap: Record<string, React.ComponentType<LucideProps>> = {
  Bug,
  Search,
  Radar,
  Atom,
  Lock,
  Globe,
  Database,
  Zap,
  Unlock,
  ExternalLink,
  KeyRound,
  Crosshair,
  Swords,
  Sparkles,
  Wrench,
};

interface ToolIconProps extends LucideProps {
  name: string;
}

export default function ToolIcon({ name, ...props }: ToolIconProps) {
  const Icon = iconMap[name] || Wrench;
  return <Icon {...props} />;
}
