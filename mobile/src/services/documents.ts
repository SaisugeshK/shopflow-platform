import { File, Paths } from 'expo-file-system'
import * as Sharing from 'expo-sharing'
import { Platform } from 'react-native'
import { fetchDocument, type Query } from './api'

/**
 * Downloads an authenticated document (invoice PDF, receipt, report export) and opens the system share sheet, so the
 * user can save it, print it or send it on WhatsApp. In the browser build it opens/downloads the file instead.
 */
export async function openDocument(path: string, fallbackName: string, query?: Query) {
  const { bytes, contentType, fileName } = await fetchDocument(path, query)
  const name = (fileName ?? fallbackName).replace(/[^\w.\-]/g, '_')
  if (Platform.OS === 'web') {
    const url = URL.createObjectURL(new Blob([bytes], { type: contentType }))
    const a = document.createElement('a')
    a.href = url
    a.download = name
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 30_000)
    return
  }
  const file = new File(Paths.cache, name)
  if (file.exists) file.delete()
  file.create()
  file.write(new Uint8Array(bytes))
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file.uri, { mimeType: contentType, dialogTitle: name, UTI: contentType === 'application/pdf' ? 'com.adobe.pdf' : undefined })
  }
}
