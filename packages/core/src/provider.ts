import { fromEventPattern, Observable } from 'rxjs'
import { filter, takeUntil, take, share, switchMap } from 'rxjs/operators'
import partition from 'lodash.partition'
import { providers, utils } from 'ethers'

import type {
  ChainId,
  EIP1102Request,
  EIP1193Provider,
  ProviderAccounts,
  Chain,
  AccountsListener,
  ChainListener,
  SelectAccountsRequest
} from '@bn-onboard/common'

import { disconnectWallet$ } from './streams'
import type { Account, Address, Balances, Ens, WalletState } from './types'
import { updateAccount, updateWallet } from './store/actions'
import { validEnsChain } from './utils'
import disconnect from './disconnect'
import { state } from './store'

export function requestAccounts(
  provider: EIP1193Provider
): Promise<ProviderAccounts> {
  const args = { method: 'eth_requestAccounts' } as EIP1102Request
  return provider.request(args)
}

export function selectAccounts(
  provider: EIP1193Provider
): Promise<ProviderAccounts> {
  const args = { method: 'eth_selectAccounts' } as SelectAccountsRequest
  return provider.request(args)
}

export function getChainId(provider: EIP1193Provider): Promise<string> {
  return provider.request({ method: 'eth_chainId' }) as Promise<string>
}

export function listenAccountsChanged(args: {
  provider: EIP1193Provider
  disconnected$: Observable<string>
}): Observable<ProviderAccounts> {
  const { provider, disconnected$ } = args

  const addHandler = (handler: AccountsListener) => {
    provider.on('accountsChanged', handler)
  }

  const removeHandler = (handler: AccountsListener) => {
    provider.removeListener('accountsChanged', handler)
  }

  return fromEventPattern<ProviderAccounts>(addHandler, removeHandler).pipe(
    takeUntil(disconnected$)
  )
}

export function listenChainChanged(args: {
  provider: EIP1193Provider
  disconnected$: Observable<string>
}): Observable<ChainId> {
  const { provider, disconnected$ } = args
  const addHandler = (handler: ChainListener) => {
    provider.on('chainChanged', handler)
  }

  const removeHandler = (handler: ChainListener) => {
    provider.removeListener('chainChanged', handler)
  }

  return fromEventPattern<ChainId>(addHandler, removeHandler).pipe(
    takeUntil(disconnected$)
  )
}

export function trackWallet(
  provider: EIP1193Provider,
  label: WalletState['label']
): void {
  const disconnected$ = disconnectWallet$.pipe(
    filter(wallet => wallet === label),
    take(1)
  )

  const accountsChanged$ = listenAccountsChanged({
    provider,
    disconnected$
  }).pipe(share())

  // when account changed, set it to first account
  accountsChanged$.subscribe(([address]) => {
    // no address, then no account connected, so disconnect wallet
    // this could happen if user locks wallet,
    // or if disconnects app from wallet
    if (!address) {
      disconnect({ label })
      return
    }

    const { wallets } = state.get()
    const { accounts } = wallets.find(wallet => wallet.label === label)

    const [[existingAccount], restAccounts] = partition(
      accounts,
      account => account.address === address
    )

    // update accounts without ens and balance first
    updateWallet(label, {
      accounts: [
        existingAccount || { address: address, ens: null, balance: null },
        ...restAccounts
      ]
    })
  })

  // also when accounts change update Balance and ENS
  accountsChanged$
    .pipe(
      switchMap(async ([address]) => {
        if (!address) return

        const { wallets, chains } = state.get()

        const { chains: walletChains, accounts } = wallets.find(
          wallet => wallet.label === label
        )

        const chain = chains.find(
          ({ namespace, reference }) =>
            namespace === 'eip155' && reference === walletChains.eip155
        )

        console.log({ chain })

        const balanceProm = getBalance(address, chain)
        const account = accounts.find(account => account.address === address)

        const ensProm = account.ens
          ? Promise.resolve(account.ens)
          : validEnsChain(walletChains.eip155)
          ? getEns(address, chain)
          : Promise.resolve(null)

        return Promise.all([Promise.resolve(address), balanceProm, ensProm])
      })
    )
    .subscribe(res => {
      if (!res) return
      const [address, balance, ens] = res
      updateAccount(label, address, { balance, ens })
    })

  const chainChanged$ = listenChainChanged({ provider, disconnected$ }).pipe(
    share()
  )

  // Update chain on wallet when chainId changed
  chainChanged$.subscribe(chainId => {
    const { wallets } = state.get()
    const { chains, accounts } = wallets.find(wallet => wallet.label === label)
    const chainReference = `${parseInt(chainId)}`

    if (chainReference === chains['eip155']) return

    const resetAccounts = accounts.map(
      ({ address }) =>
        ({
          address,
          ens: null,
          balance: null
        } as Account)
    )

    updateWallet(label, {
      chains: { ...chains, ['eip155']: chainReference },
      accounts: resetAccounts
    })
  })

  // when chain changes get ens and balance for each account for wallet
  chainChanged$
    .pipe(
      switchMap(async chainId => {
        const { wallets, chains } = state.get()
        const { accounts } = wallets.find(wallet => wallet.label === label)
        const chain = chains.find(
          ({ namespace, reference }) =>
            namespace === 'eip155' && reference === `${parseInt(chainId)}`
        )

        return Promise.all(
          accounts.map(async ({ address }) => {
            const balanceProm = getBalance(address, chain)

            const ensProm = validEnsChain(chainId)
              ? getEns(address, chain)
              : Promise.resolve(null)

            const [balance, ens] = await Promise.all([balanceProm, ensProm])

            return {
              address,
              balance,
              ens
            }
          })
        )
      })
    )
    .subscribe(updatedAccounts => {
      updatedAccounts && updateWallet(label, { accounts: updatedAccounts })
    })

  disconnected$.subscribe(() => {
    provider.disconnect && provider.disconnect()
  })
}

export async function getEns(
  address: Address,
  chain: Chain
): Promise<Ens | null> {
  const ethersProvider = new providers.JsonRpcProvider(chain.rpcUrl)
  const name = await ethersProvider.lookupAddress(address)
  let ens = null

  if (name) {
    const resolver = await ethersProvider.getResolver(name)

    if (resolver) {
      const contentHash = await resolver.getContentHash()
      const getText = resolver.getText.bind(resolver)

      ens = {
        name,
        contentHash,
        getText
      }
    }
  }

  return ens
}

export async function getBalance(
  address: string,
  chain: Chain
): Promise<Balances | null> {
  const ethersProvider = new providers.JsonRpcProvider(chain.rpcUrl)
  const balanceWei = await ethersProvider.getBalance(address)

  return balanceWei
    ? { [chain.token || 'eth']: utils.formatEther(balanceWei) }
    : null
}

export function switchChain(
  provider: EIP1193Provider,
  chainId: ChainId
): Promise<unknown> {
  const [namespace, reference] = chainId.split(':')
  return provider.request({
    method: 'wallet_switchEthereumChain',
    params: [{ chainId: `0x${parseInt(reference).toString(16)}` }]
  })
}

export function addNewChain(
  provider: EIP1193Provider,
  { reference, label, token, rpcUrl }: Chain
): Promise<unknown> {
  return provider.request({
    method: 'wallet_addEthereumChain',
    params: [
      {
        chainId: `0x${parseInt(reference).toString(16)}`,
        chainName: label,
        nativeCurrency: {
          name: label,
          symbol: token,
          decimals: 18
        },
        rpcUrls: [rpcUrl]
      }
    ]
  })
}
