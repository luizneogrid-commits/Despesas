import {
  ArrowDownLeft,
  ArrowLeftRight,
  BadgeCheck,
  Banknote,
  Briefcase,
  Send,
  TrendingUp,
  Bike,
  CarTaxiFront,
  CircleHelp,
  Dices,
  Dumbbell,
  Fuel,
  GraduationCap,
  HeartPulse,
  House,
  Package,
  PawPrint,
  Percent,
  Plane,
  Repeat,
  Shirt,
  ShoppingCart,
  Sparkles,
  Tag,
  Ticket,
  Tv,
  Utensils,
  Wrench,
  type LucideIcon,
} from 'lucide-react';

const ICONS: Record<string, LucideIcon> = {
  'shopping-cart': ShoppingCart,
  utensils: Utensils,
  bike: Bike,
  'car-taxi': CarTaxiFront,
  fuel: Fuel,
  tv: Tv,
  repeat: Repeat,
  package: Package,
  shirt: Shirt,
  'heart-pulse': HeartPulse,
  home: House,
  'graduation-cap': GraduationCap,
  ticket: Ticket,
  plane: Plane,
  dumbbell: Dumbbell,
  sparkles: Sparkles,
  'paw-print': PawPrint,
  dices: Dices,
  wrench: Wrench,
  percent: Percent,
  'circle-help': CircleHelp,
  'badge-check': BadgeCheck,
  tag: Tag,
  send: Send,
  banknote: Banknote,
  briefcase: Briefcase,
  'arrow-down-left': ArrowDownLeft,
  'trending-up': TrendingUp,
  'arrow-left-right': ArrowLeftRight,
};

export function CategoryIcon({
  icon,
  size = 'md',
}: {
  icon: string | undefined;
  size?: 'sm' | 'md';
}) {
  const Icon = (icon && ICONS[icon]) || Tag;
  return (
    <span className={`cat-icon${size === 'sm' ? ' cat-icon--sm' : ''}`} aria-hidden="true">
      <Icon size={size === 'sm' ? 14 : 16} strokeWidth={1.8} />
    </span>
  );
}
