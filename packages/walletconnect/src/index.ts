import type { WalletInit } from '@web3-onboard/common'
import { EthereumProviderOptions } from '@walletconnect/ethereum-provider/dist/types/EthereumProvider'
import v1 from './v1.js'
import v2 from './v2.js'

export type WalletConnectOptions = {
  /**
   * Optional function to handle WalletConnect URI when it becomes available
   */
  handleUri?: (uri: string) => Promise<unknown>
} & (
  | {
    /**
     * @deprecated
     * Version 1 of WalletConnect has been deprecated by the WC team and the WC bridge is not available.
     * To use version 1 a custom bridge url will need to be provided.
     * Support will be completely remove from Web3-Onboard in the future
    */
   version: 1
   connectFirstChainId?: boolean
   bridge?: string
   qrcodeModalOptions?: {
     mobileLinks: string[]
   }
  }
  | {
      /**
       * Project ID associated with [WalletConnect account](https://cloud.walletconnect.com)
       */
      projectId: string
      /**
       * Defaults to version: 2
       */
      version?: 2
      /**
       * List of Required Chain(s) ID for wallets to support in number format (integer or hex)
       * Defaults to [1] - Ethereum
       */
      requiredChains?: number[] | undefined
      /**
       * List of Optional Chain(s) ID for wallets to support in number format (integer or hex)
       * Defaults to the chains provided within the web3-onboard init chain property
       */
      optionalChains?: number[] | undefined
      /**
       * `undefined` by default, see https://docs.walletconnect.com/2.0/web/walletConnectModal/options
       */
      qrModalOptions?: EthereumProviderOptions['qrModalOptions']
      /**
       * Defaults to include ['eth_sendTransaction',  'eth_signTransaction',  'personal_sign',  'eth_sign',  'eth_signTypedData',  'eth_signTypedData_v4']
       * Pass methods to be included with the defaults methods if needed - see https://docs.walletconnect.com/2.0/web/walletConnectModal/options
       */
      optionalMethods?: string[] | undefined
    }
)

export const isHexString = (value: string | number) => {
  if (typeof value !== 'string' || !value.match(/^0x[0-9A-Fa-f]*$/)) {
    return false
  }

  return true
}

function walletConnect(options: WalletConnectOptions): WalletInit {
  options.version = options.version || 2
  return options.version === 2 ? v2(options) : v1(options)
}

export default walletConnect
