export default async function findAsync<T>(arr: Array<T>, asyncCallback: (arg0: T) => Promise<boolean | undefined>): Promise<T> {
  const promises = arr.map(asyncCallback)
  const results = await Promise.all(promises)
  const index = results.findIndex(result => result)
  return arr[index]
}
