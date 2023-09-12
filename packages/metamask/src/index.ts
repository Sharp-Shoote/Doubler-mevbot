import { MetaMaskSDK, MetaMaskSDKOptions } from '@metamask/sdk'
import { WalletInit, createEIP1193Provider } from '@web3-onboard/common'

function metamaskWallet({
  options
}: {
  options: Partial<MetaMaskSDKOptions>
}): WalletInit {
  return (helpers) => {

    let sdk: MetaMaskSDK

    return {
      label: 'MetaMask SDK',
      getIcon: async () => (await import('./icon.js')).default,
      getInterface: async ({ chains, appMetadata }) => {
        const { name, icon } = appMetadata || {}
        const base64 = window.btoa(icon || '')
        const appLogoUrl = `data:image/svg+xml;base64,${base64}`

        if (!sdk) {
          sdk = new MetaMaskSDK({
            ...options,
            dappMetadata: {
              name: options.dappMetadata?.name || name || '',
              base64Icon: appLogoUrl
            },
            _source: 'web3-onboard'
          })
        }
        await sdk.init()

        const getProvider = () => {
          const provider = createEIP1193Provider(sdk.getProvider(), {})
          provider.disconnect = () => {
            sdk.terminate()
          }
          return provider;
        }
        const provider = getProvider()

        const _request = provider.request
        provider.request = async ({ method, params }) => {
          if (sdk.isExtensionActive()) {
            return (window.extension as any).request({ method, params })
          }
          return _request({ method, params }) as Promise<any>
        }

        return {
          provider,
          instance: sdk
        }
      }
    }
  }
}

export default metamaskWallet
