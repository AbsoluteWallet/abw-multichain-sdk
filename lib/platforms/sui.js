const { JsonRpcProvider, Connection, Ed25519Keypair, fromB64, TransactionBlock,
    RawSigner } = require('@mysten/sui.js');
// const apiClient = require("../api-client");

const suiType = '0x2::sui::SUI';
const rpcs = new Map ([
    ['sui', 'https://fullnode.mainnet.sui.io:443']]);

class SuiPlatform {
    constructor(platform, apiClient) {
        this.rpcMap = new Map();
        this.apiClient = apiClient;
        this.platform = platform;
    }

    async setNodes(nodes) {
        if (nodes) {
            this.node = nodes[0];
            const key = this.node.name;
            const web = await this.switchRpc(this.node);
            this.rpcMap.set(key, web);
        } else {
            this.node = null;
            this.rpcMap.clear();
        }
    }

    async switchRpc(node, index = 0) {
        let rpc = rpcs.get(node.name);
        this.currHost = rpc;
        return new JsonRpcProvider(new Connection({
            fullnode: rpc
        }));
    }

    addressFromKey(key) {
        const keypair = Ed25519Keypair.fromSecretKey(fromB64(key));
        return keypair.getPublicKey().toSuiAddress();
    }

    async registerWallet(mnemonic) {
        const keypair = Ed25519Keypair.deriveKeypair(mnemonic);
        return { walletAddress: keypair.getPublicKey().toSuiAddress(), walletKey: keypair.export().privateKey };
    }

    genTxObj(txS) {
        const dest = [];
        const destItems = [];
        let txType = 0;
        for (let i = 0; i < txS.length; i++) {
            const txObj = txS[i];
            let coin = txObj.tx.coin;

            const amount = Math.floor(txObj.tx.value * Math.pow(10, coin['satoshi'] || 9));

            dest.push({
                    to: txObj.destItem.address,
                    amount: amount
                }
            );

            destItems.push(txObj.destItem);
        }
        return  {
            sourceItem: txS[0].sourceItem,
            transfers: dest,
            destItems: destItems,
            token: txS[txS.length-1].tx.coin.name,
            coin: txS[txS.length-1].tx.coin,
            tx: txS[txS.length-1].tx
        };
    }

    async buildTransaction(node, txObj, txName = 'transfer') {
        const web = this.rpcMap.get(node.name);

        const srcObj = txObj.sourceItem;
        const tx = txObj.tx;
        const coin = tx.coin;
        const transfers = txObj.transfers;

        const coinType = coin['contract'];
        const txb = new TransactionBlock();
        let coinObject;

        try {
            if (coinType === suiType) {

                coinObject = txb.gas;

            } else {

                const coinXs = await web.getCoins({owner: srcObj.address, coinType: coinType});
                let primaryCoinX, restCoinXs;

                if (coinXs.data.length < 2) {

                    if (!coinXs.data.length) {
                        return;
                    }
                    primaryCoinX = coinXs.data[0];

                } else {

                    [primaryCoinX, ...restCoinXs] = coinXs.data;
                    tx.mergeCoins(
                        tx.object(primaryCoinX.coinObjectId),
                        restCoinXs.map((coin) => tx.object(coin.coinObjectId)),
                    );

                }

                coinObject = tx.object(primaryCoinX.coinObjectId)

            }

            const coins = txb.splitCoins(
                coinObject,
                transfers.map((transfer) => txb.pure(transfer.amount))
            );

            transfers.forEach((transfer, index) => {
                txb.transferObjects([coins[index]], txb.pure(transfer.to));
            });

            return transfers;
        } catch (error) {
            throw new Error (`SUI Build TX error ${error.toString()}` );
        }
    }

    async signTransaction(node, transaction, key) {
        const web = this.rpcMap.get(node.name);
        const keypair = Ed25519Keypair.fromSecretKey(fromB64(key));
        const signer = new RawSigner(keypair, web);
        const signed = await signer.signTransactionBlock({transactionBlock: transaction});
        return JSON.stringify(signed);
    }

    async checkAddress(address, nodeName) {
        return /(0x[a-fA-F\d]{64})/g.test(address);
    }
}

exports.SuiPlatform = SuiPlatform;
