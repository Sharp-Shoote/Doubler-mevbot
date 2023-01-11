import uniqBy from 'lodash.uniqby'
import type { WalletInit } from '@web3-onboard/common'
import { ProviderLabel } from './types.js'
import standardWallets from './wallets.js'
import { validateWalletOptions } from './validation.js'
import { defaultWalletUnavailableMsg } from './helpers'

import type {
  InjectedWalletOptions,
  CustomWindow,
  InjectedWalletModule
} from './types.js'

declare const window: CustomWindow

export { ProviderIdentityFlag, ProviderLabel } from './types.js'

function injected(options?: InjectedWalletOptions): WalletInit {
  if (typeof window === 'undefined') return () => null

  if (options) {
    const result = validateWalletOptions(options)

    if (result && result.error) throw result.error
  }

  return helpers => {
    const { device } = helpers
    const {
      custom = [],
      filter = {},
      displayUnavailable,
      sort,
      walletUnavailableMessage
    } = options || {}
    const allWallets = [...custom, ...standardWallets]
    const deduped = uniqBy(allWallets, ({ label }) => label)

    const filteredWallets = deduped.filter(wallet => {
      const { label, platforms } = wallet
      const walletFilters = filter[label]

      const filteredWallet = walletFilters === false

      const excludedDevice =
        Array.isArray(walletFilters) &&
        (walletFilters.includes(device.type) ||
          walletFilters.includes(device.os.name))

      const invalidPlatform =
        !platforms.includes('all') &&
        !platforms.includes(device.type) &&
        !platforms.includes(device.os.name)

      const supportedWallet =
        !filteredWallet && !excludedDevice && !invalidPlatform

      return supportedWallet
    })

    let removeMetaMask = false

    const validWallets = filteredWallets.map(wallet => {
      const { injectedNamespace, checkProviderIdentity, label } = wallet
      const provider = window[injectedNamespace] as CustomWindow['ethereum']

      let walletExists = false

      if (provider && provider.providers && Array.isArray(provider.providers)) {
        walletExists = !!provider.providers.filter(provider =>
          checkProviderIdentity({ provider, device })
        ).length
      } else {
        walletExists = checkProviderIdentity({ provider, device })
      }

      if (
        walletExists &&
        provider.isMetaMask &&
        !provider.overrideIsMetaMask &&
        label !== ProviderLabel.MetaMask &&
        label !== 'Detected Wallet'
      ) {
        removeMetaMask = true
      }

      return walletExists
        ? wallet
        : displayUnavailable
        ? {
            ...wallet,
            getInterface: async () => {
              throw new Error(
                walletUnavailableMessage
                  ? walletUnavailableMessage(wallet)
                  : defaultWalletUnavailableMsg(wallet)
              )
            }
          }
        : null
    })

    if (validWallets.length) {
      const moreThanOneWallet = validWallets.length > 1
      // if more than one wallet, then remove detected wallet
      const formattedWallets = validWallets
        .filter((wallet): wallet is InjectedWalletModule => {
          if (wallet === null) return false

          const { label } = wallet
          return !(
            (label === ProviderLabel.Detected && moreThanOneWallet) ||
            (label === ProviderLabel.MetaMask &&
              moreThanOneWallet &&
              removeMetaMask)
          )
        })
        .map(({ label, getIcon, getInterface }: InjectedWalletModule) => ({
          label,
          getIcon,
          getInterface
        }))
        .sort((a, b) => (a.label < b.label ? -1 : a.label > b.label ? 1 : 0))

      return sort ? sort(formattedWallets) : formattedWallets
    }

    return []
  }
}

export default injected
