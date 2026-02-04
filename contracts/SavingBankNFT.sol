// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

interface INFTMetadata {
    function setCertificateData(
        uint256 tokenId,
        uint256 planId,
        uint256 depositAmount
    ) external;

    function deleteCertificateData(uint256 tokenId) external;

    function tokenURI(uint256 tokenId) external view returns (string memory);

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
        );
}

/**
 * @title SavingBankNFT
 * @notice NFT certificate with delegated metadata to separate upgradeable contract
 * @dev Core NFT contract (non-upgradeable) delegates metadata to NFTMetadataUpgradeable
 */
contract SavingBankNFT is ERC721, AccessControl {
    /*//////////////////////////////////////////////////////////////
                                ERRORS
    //////////////////////////////////////////////////////////////*/
    error Unauthorized();
    error InvalidAddress();
    error TokenNotExists();
    error InvalidMetadataContract();

    /*//////////////////////////////////////////////////////////////
                              CONSTANTS
    //////////////////////////////////////////////////////////////*/
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");

    /*//////////////////////////////////////////////////////////////
                           STATE VARIABLES
    //////////////////////////////////////////////////////////////*/
    address public savingBank;
    address public metadataContract;

    /*//////////////////////////////////////////////////////////////
                                EVENTS
    //////////////////////////////////////////////////////////////*/
    event SavingBankUpdated(address indexed oldBank, address indexed newBank);
    event MetadataContractUpdated(
        address indexed oldContract,
        address indexed newContract
    );
    event CertificateMinted(
        uint256 indexed tokenId,
        address indexed owner,
        uint256 planId,
        uint256 depositAmount
    );
    event CertificateBurned(uint256 indexed tokenId);

    /*//////////////////////////////////////////////////////////////
                              MODIFIERS
    //////////////////////////////////////////////////////////////*/
    modifier onlySavingBank() {
        if (msg.sender != savingBank) revert Unauthorized();
        _;
    }

    /*//////////////////////////////////////////////////////////////
                             CONSTRUCTOR
    //////////////////////////////////////////////////////////////*/
    constructor(
        address _admin,
        address _operator,
        address _metadataContract
    ) ERC721("Saving Bank Certificate", "SBC") {
        if (_admin == address(0)) revert InvalidAddress();
        if (_operator == address(0)) revert InvalidAddress();
        if (_metadataContract == address(0)) revert InvalidMetadataContract();

        metadataContract = _metadataContract;

        // Grant roles
        _grantRole(DEFAULT_ADMIN_ROLE, _admin);
        _grantRole(ADMIN_ROLE, _admin);
        _grantRole(OPERATOR_ROLE, _operator);
    }

    /*//////////////////////////////////////////////////////////////
                        SAVINGBANK FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /**
     * @notice Mint a new certificate NFT
     * @dev Metadata is stored and managed in separate metadata contract
     * @param to Address to mint the NFT to
     * @param tokenId Token ID for the NFT
     * @param planId Plan ID of the deposit
     * @param depositAmount Amount deposited
     */
    function mint(
        address to,
        uint256 tokenId,
        uint256 planId,
        uint256 depositAmount
    ) external onlySavingBank {
        _safeMint(to, tokenId);

        // Delegate metadata storage to metadata contract
        INFTMetadata(metadataContract).setCertificateData(
            tokenId,
            planId,
            depositAmount
        );

        emit CertificateMinted(tokenId, to, planId, depositAmount);
    }

    /**
     * @notice Burn a certificate NFT
     * @param tokenId Token ID to burn
     */
    function burn(uint256 tokenId) external onlySavingBank {
        if (_ownerOf(tokenId) == address(0)) revert TokenNotExists();

        _burn(tokenId);

        // Clean up metadata in metadata contract
        INFTMetadata(metadataContract).deleteCertificateData(tokenId);

        emit CertificateBurned(tokenId);
    }

    /*//////////////////////////////////////////////////////////////
                          ADMIN FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /**
     * @notice Set the SavingBank contract address
     * @param _savingBank Address of the SavingBank contract
     */
    function setSavingBank(address _savingBank) external onlyRole(ADMIN_ROLE) {
        if (_savingBank == address(0)) revert InvalidAddress();
        address oldBank = savingBank;
        savingBank = _savingBank;
        emit SavingBankUpdated(oldBank, _savingBank);
    }

    /**
     * @notice Update metadata contract (allows upgrading metadata logic)
     * @param _newMetadataContract Address of new metadata contract
     */
    function setMetadataContract(
        address _newMetadataContract
    ) external onlyRole(ADMIN_ROLE) {
        if (_newMetadataContract == address(0))
            revert InvalidMetadataContract();
        address oldContract = metadataContract;
        metadataContract = _newMetadataContract;
        emit MetadataContractUpdated(oldContract, _newMetadataContract);
    }

    /*//////////////////////////////////////////////////////////////
                          METADATA DELEGATION
    //////////////////////////////////////////////////////////////*/

    /**
     * @notice Get token URI from metadata contract
     * @dev Delegates to upgradeable metadata contract
     * @param tokenId Token ID to query
     * @return Token URI string
     */
    function tokenURI(
        uint256 tokenId
    ) public view virtual override returns (string memory) {
        _requireOwned(tokenId);
        return INFTMetadata(metadataContract).tokenURI(tokenId);
    }

    /*//////////////////////////////////////////////////////////////
                      SOULBOUND IMPLEMENTATION
    //////////////////////////////////////////////////////////////*/

    /**
     * @notice Override to prevent token transfers (soulbound certificates)
     * @dev Only allows minting and burning, no transfers between users
     */
    function _update(
        address to,
        uint256 tokenId,
        address auth
    ) internal virtual override returns (address) {
        address from = _ownerOf(tokenId);

        // Allow minting (from == address(0)) and burning (to == address(0))
        // Prevent transfers between users (from != address(0) && to != address(0))
        if (from != address(0) && to != address(0)) {
            revert Unauthorized();
        }

        return super._update(to, tokenId, auth);
    }

    /*//////////////////////////////////////////////////////////////
                              OVERRIDES
    //////////////////////////////////////////////////////////////*/

    /**
     * @notice Override supportsInterface for AccessControl and ERC721
     */
    function supportsInterface(
        bytes4 interfaceId
    ) public view override(ERC721, AccessControl) returns (bool) {
        return super.supportsInterface(interfaceId);
    }
}
