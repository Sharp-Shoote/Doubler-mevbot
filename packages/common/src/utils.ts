import { formatEther, hexToBigInt, numberToHex, parseEther } from 'viem'
import type { Address } from './types.js'

export const isAddress = (address: string): address is Address => {
  return isAddress(address)
}

export const weiHexToEth = (wei: `0x${string}`): string => {
  const weiBigInt = hexToBigInt(wei)
  return formatEther(weiBigInt)
}

export const weiToEth = (wei: string): string => {
  if (!wei) return wei
  const weiBigInt = BigInt(parseInt(wei))
  return formatEther(weiBigInt)
}

export const ethToWeiBigInt = (eth: string | number): bigint => {
  if (typeof eth !== 'string' && typeof eth !== 'number') {
    throw new Error('eth must be a string or number value')
  }

  const ethString = typeof eth === 'number' ? eth.toString() : eth

  return parseEther(ethString)
}

export const bigIntToHex = (value: bigint): string => {
  return numberToHex(value)
}
