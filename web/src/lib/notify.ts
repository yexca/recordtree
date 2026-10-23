import { notifications } from '@mantine/notifications';
import { errorMessage } from './format';

export function notifyError(title: string, error: unknown) {
  notifications.show({ color: 'red', title, message: errorMessage(error) });
}

export function notifySuccess(title: string, message?: string) {
  notifications.show({ color: 'teal', title: message ? title : undefined, message: message ?? title });
}
