export { adminSections } from './admin-navigation';

export interface ShellNavLink {
  label: string;
  path: string;
  roles?: string[];
}

export interface ShellNavSection {
  links: ShellNavLink[];
  title: string;
}

const ownerRoles = [
  'SINGLE_TENANT_OWNER',
  'SINGLE_TENANT_ADMIN'
];
const dataToolRoles = [...ownerRoles, 'SINGLE_TENANT_DEVELOPER', 'SINGLE_TENANT_VIEWER'];

export const sharedSidebarPrefixes = ['/home', '/ai-analyzer', '/learn', '/templates', '/data-dictionary'];
export const fullBleedPrefixes = ['/dashboard', '/sql-editor'];

export const customerSections: ShellNavSection[] = [
  { title: 'Workspace', links: [{ path: '/home', label: 'Home', roles: dataToolRoles }] },
  { title: 'Dashboards', links: [{ path: '/dashboard', label: 'My Dashboards', roles: dataToolRoles }] },
  {
    title: 'Resources',
    links: [
      { path: '/templates', label: 'Templates', roles: dataToolRoles },
      { path: '/learn', label: 'Learn', roles: dataToolRoles },
      { path: '/data-dictionary', label: 'Data Dictionary', roles: dataToolRoles }
    ]
  },
  {
    title: 'Tools',
    links: [
      { path: '/sql-editor', label: 'SQL Editor', roles: dataToolRoles },
      { path: '/ai-analyzer', label: 'AI Analyzer', roles: dataToolRoles }
    ]
  }
];

const customerMainLinks: ShellNavLink[] = [
  { path: '/home', label: 'Home', roles: dataToolRoles },
  { path: '/dashboard', label: 'Dashboard', roles: dataToolRoles },
  { path: '/sql-editor', label: 'SQL Editor', roles: dataToolRoles },
  { path: '/data-dictionary', label: 'Data Dictionary', roles: dataToolRoles }
];

export function visibleSections(sections: ShellNavSection[], role: string): ShellNavSection[] {
  return sections
    .map(section => ({
      ...section,
      links: section.links.filter(link => shellNavLinkVisible(link, role))
    }))
    .filter(section => section.links.length > 0);
}

export function customerMainLinksForRole(role: string): ShellNavLink[] {
  return customerMainLinks.filter(link => shellNavLinkVisible(link, role));
}

function shellNavLinkVisible(link: ShellNavLink, role: string): boolean {
  const roleVisible = !link.roles || link.roles.includes(role);
  return roleVisible;
}
