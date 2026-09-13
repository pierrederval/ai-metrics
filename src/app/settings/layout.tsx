import { AppShell } from '../../components/app-shell';
export default function Layout({ children }: { children: React.ReactNode }) {
  return <AppShell crumbs={[{ label: 'Settings' }]}>{children}</AppShell>;
}
