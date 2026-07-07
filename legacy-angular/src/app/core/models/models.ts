// Sidebar navigation models
export interface NavItem {
  label: string;
  href: string;
  icon?: string;
  active?: boolean;
  badge?: number;
  children?: NavItem[];
}

export interface NavGroup {
  title: string;
  items: NavItem[];
}

// Search models
export interface RecentSearch {
  text: string;
  href: string;
}

export interface RecentPage {
  title: string;
  subtitle: string;
  href: string;
}

// Notification models
export interface Notification {
  id: string;
  emoji: string;
  title: string;
  description: string;
  date: string;
  href: string;
  read?: boolean;
}

// Help link models
export interface HelpLink {
  icon: 'documentation' | 'support' | 'contact';
  text: string;
  href: string;
}

// User models
export interface User {
  name: string;
  role: string;
  avatarSrc: string;
}

export interface UserMenuItem {
  text: string;
  href: string;
}

// Chart/Dashboard data models
export interface ChartCardData {
  id: string;
  title: string;
  subtitle?: string;
  value: string;
  changePercent: number;
  chartData?: number[];
}

export interface TableChannel {
  name: string;
  iconSvg: string;
  iconBgColor: string;
  visitors: string;
  revenues: string;
  sales: string;
  conversion: string;
}

export interface ActivityItem {
  id: string;
  type: 'comment' | 'removed' | 'published' | 'subscribed';
  iconBgColor: string;
  content: string;
  actionText: string;
  actionHref: string;
}

export interface ActivityGroup {
  header: string;
  items: ActivityItem[];
}

export interface IncomeExpenseItem {
  id: string;
  type: 'income' | 'expense' | 'blocked';
  title: string;
  description: string;
  amount: string;
  isPositive: boolean;
}

export interface FilterOption {
  label: string;
  checked: boolean;
}

