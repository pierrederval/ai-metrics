import Link from 'next/link';
import './style.css';
export const metadata={title:'Engineering Reliability',description:'Evidence-first PR and CI reliability'};
export default function Layout({children}:{children:React.ReactNode}){return <html lang="en"><body><header><Link href="/dashboard">Engineering Reliability</Link><span>Evidence first</span><form action="/api/auth/logout" method="post"><button>Sign out</button></form></header><main>{children}</main></body></html>;}
