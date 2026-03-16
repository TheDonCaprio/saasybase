import Link from 'next/link';
import type { ComponentProps } from 'react';

type TransientNavLinkProps = Omit<ComponentProps<typeof Link>, 'prefetch'>;

export function TransientNavLink(props: TransientNavLinkProps) {
  return <Link prefetch={false} {...props} />;
}