import { ICON_BODIES, type IconName } from './icons';

export function Icon({ name, class: cls = 'ico', label }: { name: IconName; class?: string; label?: string }) {
  return (
    <svg
      class={cls}
      viewBox="0 0 512 512"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      dangerouslySetInnerHTML={{ __html: ICON_BODIES[name] }}
    />
  );
}
