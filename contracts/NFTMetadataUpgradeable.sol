// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

/**
 * @title NFTMetadataUpgradeable - Off-chain Version
 * @notice Sử dụng IPFS để lưu metadata, chỉ lưu hash on-chain
 */
contract NFTMetadataUpgradeable is
    Initializable,
    AccessControlUpgradeable,
    UUPSUpgradeable
{
    /*//////////////////////////////////////////////////////////////
                                ERRORS
    //////////////////////////////////////////////////////////////*/
    error Unauthorized();
    error InvalidAddress();
    error TokenNotExists();
    error EmptyHash();

    /*//////////////////////////////////////////////////////////////
                              CONSTANTS
    //////////////////////////////////////////////////////////////*/
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    bytes32 public constant NFT_ROLE = keccak256("NFT_ROLE");

    /*//////////////////////////////////////////////////////////////
                           COMPACT STRUCTS
    //////////////////////////////////////////////////////////////*/
    // Đóng gói data để tiết kiệm storage slots
    struct CertificateData {
        uint96 depositAmount; // 96 bits - đủ cho hầu hết token amounts
        uint64 depositTime; // 64 bits - timestamp
        uint32 planId; // 32 bits - plan ID
        uint32 depositId; // 32 bits - deposit ID
    }
    // Total: 224 bits = fit in 1 storage slot (256 bits)

    /*//////////////////////////////////////////////////////////////
                           STATE VARIABLES
    //////////////////////////////////////////////////////////////*/
    address public nftContract;

    // Base URI cho IPFS
    string public baseURI;

    // Chỉ lưu compact data on-chain
    mapping(uint256 => CertificateData) private _certificateData;

    // Option: Lưu IPFS hash cho từng token (nếu cần custom metadata)
    mapping(uint256 => string) private _tokenIPFSHash;

    /*//////////////////////////////////////////////////////////////
                                EVENTS
    //////////////////////////////////////////////////////////////*/
    event NFTContractUpdated(
        address indexed oldContract,
        address indexed newContract
    );
    event CertificateDataSet(uint256 indexed tokenId);
    event CertificateDataDeleted(uint256 indexed tokenId);
    event BaseURIUpdated(string newBaseURI);
    event TokenIPFSHashSet(uint256 indexed tokenId, string ipfsHash);

    /*//////////////////////////////////////////////////////////////
                              MODIFIERS
    //////////////////////////////////////////////////////////////*/
    modifier onlyNFTContract() {
        if (msg.sender != nftContract) revert Unauthorized();
        _;
    }

    /*//////////////////////////////////////////////////////////////
                            INITIALIZER
    //////////////////////////////////////////////////////////////*/
    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(
        address _admin,
        address _nftContract,
        string memory _baseURI
    ) public initializer {
        if (_admin == address(0)) revert InvalidAddress();
        if (_nftContract == address(0)) revert InvalidAddress();

        __AccessControl_init();
        __UUPSUpgradeable_init();

        nftContract = _nftContract;
        baseURI = _baseURI; // e.g., "ipfs://QmYourBaseHash/"

        _grantRole(DEFAULT_ADMIN_ROLE, _admin);
        _grantRole(ADMIN_ROLE, _admin);
        _grantRole(NFT_ROLE, _nftContract);
    }

    /*//////////////////////////////////////////////////////////////
                          NFT CONTRACT FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /**
     * @notice Set certificate data - GAS OPTIMIZED
     * @dev Chỉ lưu compact data on-chain
     */
    function setCertificateData(
        uint256 tokenId,
        uint256 planId,
        uint256 depositAmount
    ) external onlyNFTContract {
        // Pack data into single storage slot
        _certificateData[tokenId] = CertificateData({
            depositId: uint32(tokenId),
            planId: uint32(planId),
            depositAmount: uint96(depositAmount),
            depositTime: uint64(block.timestamp)
        });

        emit CertificateDataSet(tokenId);
    }

    /**
     * @notice Set IPFS hash cho token (optional)
     * @dev Chỉ gọi nếu cần custom metadata cho từng token
     */
    function setTokenIPFSHash(
        uint256 tokenId,
        string calldata ipfsHash
    ) external onlyRole(ADMIN_ROLE) {
        if (bytes(ipfsHash).length == 0) revert EmptyHash();
        _tokenIPFSHash[tokenId] = ipfsHash;
        emit TokenIPFSHashSet(tokenId, ipfsHash);
    }

    /**
     * @notice Delete certificate data
     */
    function deleteCertificateData(uint256 tokenId) external onlyNFTContract {
        delete _certificateData[tokenId];
        delete _tokenIPFSHash[tokenId]; // Also clear IPFS hash if exists
        emit CertificateDataDeleted(tokenId);
    }

    /*//////////////////////////////////////////////////////////////
                          ADMIN FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /**
     * @notice Update base URI
     */
    function setBaseURI(string memory _baseURI) external onlyRole(ADMIN_ROLE) {
        baseURI = _baseURI;
        emit BaseURIUpdated(_baseURI);
    }

    function setNFTContract(
        address _nftContract
    ) external onlyRole(ADMIN_ROLE) {
        if (_nftContract == address(0)) revert InvalidAddress();
        if (nftContract != address(0)) {
            _revokeRole(NFT_ROLE, nftContract);
        }
        address oldContract = nftContract;
        nftContract = _nftContract;
        _grantRole(NFT_ROLE, _nftContract);
        emit NFTContractUpdated(oldContract, _nftContract);
    }

    function _authorizeUpgrade(
        address newImplementation
    ) internal override onlyRole(ADMIN_ROLE) {}

    /*//////////////////////////////////////////////////////////////
                          VIEW FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /**
     * @notice Get certificate data
     */
    function getCertificateData(
        uint256 tokenId
    )
        external
        view
        returns (
            uint256 depositId,
            uint256 planId,
            uint256 depositAmount,
            uint256 depositTime
        )
    {
        CertificateData memory data = _certificateData[tokenId];
        if (data.depositTime == 0) revert TokenNotExists();

        return (
            uint256(data.depositId),
            uint256(data.planId),
            uint256(data.depositAmount),
            uint256(data.depositTime)
        );
    }

    /**
     * @notice Build token URI - IPFS VERSION
     * @dev Trỏ đến IPFS thay vì generate on-chain
     */
    function tokenURI(uint256 tokenId) external view returns (string memory) {
        CertificateData memory data = _certificateData[tokenId];
        if (data.depositTime == 0) revert TokenNotExists();

        // Nếu có custom IPFS hash cho token này
        string memory customHash = _tokenIPFSHash[tokenId];
        if (bytes(customHash).length > 0) {
            return string(abi.encodePacked("ipfs://", customHash));
        }

        // Sử dụng baseURI + tokenId
        return string(abi.encodePacked(baseURI, _toString(tokenId), ".json"));
    }

    /**
     * @notice Helper function to convert uint to string
     */
    function _toString(uint256 value) internal pure returns (string memory) {
        if (value == 0) return "0";

        uint256 temp = value;
        uint256 digits;
        while (temp != 0) {
            digits++;
            temp /= 10;
        }

        bytes memory buffer = new bytes(digits);
        while (value != 0) {
            digits -= 1;
            buffer[digits] = bytes1(uint8(48 + uint256(value % 10)));
            value /= 10;
        }

        return string(buffer);
    }

    /*//////////////////////////////////////////////////////////////
                          STORAGE GAP
    //////////////////////////////////////////////////////////////*/
    uint256[47] private __gap; // Reduced from 50 to account for new variables
}
