import { task } from "hardhat/config";
import "@openzeppelin/hardhat-upgrades";
import "@nomicfoundation/hardhat-verify";
import "hardhat-contract-sizer";
import "hardhat-abi-exporter";
import "hardhat-gas-reporter";
import "hardhat-deploy";
import "@nomicfoundation/hardhat-ethers";
import "@nomicfoundation/hardhat-chai-matchers";
import "@typechain/hardhat";
import * as dotenv from "dotenv";

dotenv.config();

task("accounts", "Prints the list of accounts", async (taskArgs, hre) => {
  const accounts = await hre.ethers.getSigners();

  for (const account of accounts) {
    console.log(account.address);
  }
});

const {
  TESTNET_PRIVATE_KEY: testnetPrivateKey,
  MAINNET_PRIVATE_KEY: mainnetPrivateKey,
} = process.env;
const reportGas = process.env.REPORT_GAS;

module.exports = {
  networks: {
    hardhat: {
      chainId: 31337,
    },
    localhost: {
      url: "http://127.0.0.1:8545",
      chainId: 31337,
    },
    sepolia: {
      url: "https://eth-sepolia.g.alchemy.com/v2/YnyRV2BOccnDHMx83D3b9",
      chainId: 11155111,
      accounts: testnetPrivateKey ? [testnetPrivateKey] : [],
      timeout: 40000,
    },
  },
  solidity: {
    compilers: [
      {
        version: "0.8.28",
        settings: {
          optimizer: {
            enabled: true,
            runs: 1000,
          },
          viaIR: true,
        },
      },
    ],
  },
  abiExporter: {
    path: "data/abi",
    runOnCompile: true,
    clear: true,
    flat: false,
    only: [],
    spacing: 4,
  },
  gasReporter: {
    enabled: reportGas == "1",
  },
  contractSizer: {
    alphaSort: true,
    disambiguatePaths: false,
    runOnCompile: true,
  },
  etherscan: {
    apiKey: process.env.ETHERSCAN_API_KEY!,
  },
  sourcify: {
    enabled: false,
  },
  mocha: {
    timeout: 40000,
  },
  namedAccounts: {
    deployer: {
      default: 0, // ← SỬA: Thêm default
      localhost: 0,
      sepolia: 0,
    },
  },
  typechain: {
    outDir: "typechain",
    target: "ethers-v6",
  },
};
