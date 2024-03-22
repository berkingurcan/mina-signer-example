import { jest, describe, expect, it } from "@jest/globals";
import Client from 'mina-signer';
import BigNumber from "bignumber.js";
import fs from "fs/promises";
import {
  AccountUpdate,
  PrivateKey,
  Mina,
  PublicKey,
  UInt64,
  Types,
} from "o1js";

jest.setTimeout(1000 * 60 * 60 * 1); // 1 hour
const transactionFee = 150_000_000;
let senderPrivateKey: PrivateKey | undefined = undefined;
let senderPublicKey: PublicKey | undefined = undefined;
let client: Client | undefined;

beforeAll(async () => {
  const Local = Mina.LocalBlockchain({ proofsEnabled: true });
  Mina.setActiveInstance(Local);
  client = new Client({ network: Local.getNetworkId() }); 
  const { privateKey } = Local.testAccounts[0];
  senderPrivateKey = privateKey;
  senderPublicKey = senderPrivateKey.toPublicKey();
  expect(senderPublicKey).not.toBeUndefined();
  expect(senderPrivateKey).not.toBeUndefined();

  await fs.mkdir('./json', { recursive: true });
});

describe("Sign, export, and import transaction", () => {
  it("should sign and export transaction", async () => {
    if (senderPublicKey === undefined || senderPrivateKey === undefined) return;
    const sender: PublicKey = senderPublicKey;
    const transaction = await Mina.transaction(
      { sender, fee: transactionFee },
      () => {
        AccountUpdate.fundNewAccount(sender);
        const senderUpdate = AccountUpdate.create(sender);
        senderUpdate.requireSignature();
        senderUpdate.send({
          to: PrivateKey.random().toPublicKey(),
          amount: UInt64.from(1_000_000_000n),
        });
      }
    );
    // Sign BEFORE exporting
    transaction.sign([senderPrivateKey]);
    await fs.writeFile("./json/tx-signed.json", transaction.toJSON());
  });

  it("should send a signed transaction", async () => {
    // @ts-ignore
    const transaction: Mina.Transaction = Mina.Transaction.fromJSON(
      JSON.parse(
        await fs.readFile("./json/tx-signed.json", "utf8")
      ) as Types.Json.ZkappCommand
    ) as Mina.Transaction;

    console.log(transaction.toPretty())
    const tx = await transaction.send();

    // @ts-ignore
    expect(tx.isSuccess).toBe(true);
  });
});

describe("Export, import and sign transaction", () => {
  it("should export unsigned transaction", async () => {
    if (senderPublicKey === undefined || senderPrivateKey === undefined) return;
    const sender: PublicKey = senderPublicKey;
    const transaction = await Mina.transaction(
      { sender, fee: transactionFee },
      () => {
        AccountUpdate.fundNewAccount(sender);
        const senderUpdate = AccountUpdate.create(sender);
        senderUpdate.requireSignature();
        senderUpdate.send({
          to: PrivateKey.random().toPublicKey(),
          amount: UInt64.from(1_000_000_000n),
        });
      }
    );
    await fs.writeFile("./json/tx-unsigned.json", transaction.toJSON());
  });

  it("should import, sign and sendtransaction", async () => {
    let signBody = {}
    const unsignedTx = JSON.parse(
      await fs.readFile("./json/tx-unsigned.json", "utf8")
    )

    let decimal = new BigNumber(10).pow(9)
    let sendFee = new BigNumber(unsignedTx.feePayer.body.fee).multipliedBy(decimal).toNumber()

    signBody = {
      zkappCommand: unsignedTx,
      feePayer: {
          feePayer: unsignedTx.feePayer.body.publicKey,
          fee: sendFee,
          nonce: unsignedTx.feePayer.body.nonce,
          memo: unsignedTx.memo.substring(0, 32)||""
      },
    }

    expect(senderPrivateKey).not.toBeUndefined();
    if (senderPrivateKey === undefined) return;

    // Sign with mina signer after importing unsigned tx. 
    // NOTE: There is a char length issue with memo.
    const signedTx = client?.signTransaction(signBody, senderPrivateKey.toBase58())

    // @ts-ignore
    const transaction: Mina.Transaction = Mina.Transaction.fromJSON(
      signedTx?.data.zkappCommand
    ) as Mina.Transaction;

    console.log("TR",transaction.toPretty())
    const tx = await transaction.send();
    // @ts-ignore
    expect(tx.isSuccess).toBe(true);
  });
});
