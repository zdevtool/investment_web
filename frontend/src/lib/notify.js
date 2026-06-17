const KEY = 'hub.notifyEnabled'

export function notifyEnabled() {
  return localStorage.getItem(KEY) === '1'
}

export function setNotifyEnabled(on) {
  if (on) localStorage.setItem(KEY, '1')
  else localStorage.removeItem(KEY)
}

export function permissionState() {
  if (!('Notification' in window)) return 'unsupported'
  return Notification.permission
}

export async function requestPermission() {
  if (!('Notification' in window)) return 'unsupported'
  if (Notification.permission === 'granted') return 'granted'
  if (Notification.permission === 'denied') return 'denied'
  try {
    const r = await Notification.requestPermission()
    return r
  } catch {
    return 'denied'
  }
}

export function notify(title, body) {
  if (!notifyEnabled()) return
  if (!('Notification' in window)) return
  if (Notification.permission !== 'granted') return
  try {
    new Notification(title, {
      body,
      icon: '/icon.svg',
      badge: '/icon.svg',
      tag: 'hub-' + title,
    })
  } catch {
    /* noop */
  }
}
