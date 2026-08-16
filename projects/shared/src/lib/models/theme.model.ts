/**
 * Theme type shared across services and message models.
 * Defined here to avoid import cycles between theme.service and messaging.service.
 */

export type Theme = 'light' | 'dark';
