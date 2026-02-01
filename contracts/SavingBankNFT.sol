// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/Base64.sol";
import "@openzeppelin/contracts/utils/Strings.sol";

contract SavingBankNFT is ERC721URIStorage, AccessControl {
    using Strings for uint256;

    /*//////////////////////////////////////////////////////////////
                                ERRORS
    //////////////////////////////////////////////////////////////*/
    error Unauthorized();
    error InvalidAddress();
    error TokenNotExists();

    /*//////////////////////////////////////////////////////////////
                              CONSTANTS
    //////////////////////////////////////////////////////////////*/
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");

    /*//////////////////////////////////////////////////////////////
                               STRUCTS
    //////////////////////////////////////////////////////////////*/
    struct CertificateData {
        uint256 depositId;
        uint256 planId;
        uint256 depositAmount;
        uint256 depositTime;
    }

    /*//////////////////////////////////////////////////////////////
                           STATE VARIABLES
    //////////////////////////////////////////////////////////////*/
    address public savingBank;

    // Mapping from token ID to certificate data
    mapping(uint256 => CertificateData) private _certificateData;

    /*//////////////////////////////////////////////////////////////
                                EVENTS
    //////////////////////////////////////////////////////////////*/
    event SavingBankUpdated(address indexed oldBank, address indexed newBank);
    event CertificateMinted(uint256 indexed tokenId, address indexed owner);
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
        address _operator
    ) ERC721("Saving Bank Certificate", "SBC") {
        if (_admin == address(0)) revert InvalidAddress();
        if (_operator == address(0)) revert InvalidAddress();

        // Grant roles
        _grantRole(DEFAULT_ADMIN_ROLE, _admin);
        _grantRole(ADMIN_ROLE, _admin);
        _grantRole(OPERATOR_ROLE, _operator);
    }

    /*//////////////////////////////////////////////////////////////
                        SAVINGBANK FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /**
     * @notice Mint a new certificate NFT with metadata
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

        // Store certificate data
        _certificateData[tokenId] = CertificateData({
            depositId: tokenId,
            planId: planId,
            depositAmount: depositAmount,
            depositTime: block.timestamp
        });

        // Set token URI with on-chain metadata
        _setTokenURI(tokenId, _buildTokenURI(tokenId));

        emit CertificateMinted(tokenId, to);
    }

    /**
     * @notice Burn a certificate NFT
     * @param tokenId Token ID to burn
     */
    function burn(uint256 tokenId) external onlySavingBank {
        if (_ownerOf(tokenId) == address(0)) revert TokenNotExists();
        _burn(tokenId);
        delete _certificateData[tokenId];
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

    /*//////////////////////////////////////////////////////////////
                          VIEW FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /**
     * @notice Get certificate data for a token
     * @param tokenId Token ID to query
     * @return Certificate data struct
     */
    function getCertificateData(
        uint256 tokenId
    ) external view returns (CertificateData memory) {
        return _certificateData[tokenId];
    }

    /**
     * @notice Override supportsInterface for AccessControl and ERC721
     */
    function supportsInterface(
        bytes4 interfaceId
    ) public view override(ERC721URIStorage, AccessControl) returns (bool) {
        return super.supportsInterface(interfaceId);
    }

    /*//////////////////////////////////////////////////////////////
                      SOULBOUND IMPLEMENTATION
    //////////////////////////////////////////////////////////////*/

    /**
     * @notice Override to prevent token transfers (soulbound certificates)
     * @dev Only allows minting and burning, no transfers
     */
    function _update(
        address to,
        uint256 tokenId,
        address auth
    ) internal virtual override returns (address) {
        address from = _ownerOf(tokenId);

        // Allow minting (from == address(0)) and burning (to == address(0))
        if (from != address(0) && to != address(0)) {
            revert Unauthorized();
        }

        return super._update(to, tokenId, auth);
    }

    /*//////////////////////////////////////////////////////////////
                       METADATA GENERATION
    //////////////////////////////////////////////////////////////*/

    /**
     * @notice Build token URI with simple on-chain metadata
     * @param tokenId Token ID
     * @return Base64 encoded data URI
     */
    function _buildTokenURI(
        uint256 tokenId
    ) internal view returns (string memory) {
        CertificateData memory data = _certificateData[tokenId];

        // Format deposit amount (assuming 18 decimals)
        string memory formattedAmount = _formatAmount(data.depositAmount);

        // Build simple JSON metadata
        bytes memory json = abi.encodePacked(
            "{",
            '"name": "Saving Bank Certificate #',
            tokenId.toString(),
            '",',
            '"description": "Certificate of Deposit - Saving Bank Protocol",',
            '"image": "data:image/svg+xml;base64,',
            _buildSimpleSVG(tokenId),
            '",',
            '"attributes": [',
            "{",
            '"trait_type": "Deposit ID",',
            '"value": ',
            tokenId.toString(),
            "},",
            "{",
            '"trait_type": "Plan ID",',
            '"value": ',
            data.planId.toString(),
            "},",
            "{",
            '"trait_type": "Amount",',
            '"value": "',
            formattedAmount,
            '"',
            "},",
            "{",
            '"trait_type": "Deposit Time",',
            '"display_type": "date",',
            '"value": ',
            data.depositTime.toString(),
            "}",
            "]",
            "}"
        );

        return
            string(
                abi.encodePacked(
                    "data:application/json;base64,",
                    Base64.encode(json)
                )
            );
    }

    /**
     * @notice Build simple SVG image
     * @param tokenId Token ID
     * @return Base64 encoded SVG
     */
    function _buildSimpleSVG(
        uint256 tokenId
    ) internal view returns (string memory) {
        CertificateData memory data = _certificateData[tokenId];
        string memory formattedAmount = _formatAmount(data.depositAmount);

        bytes memory svg = abi.encodePacked(
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 350 200">',
            // Background
            '<rect width="350" height="200" fill="#1a1a2e"/>',
            // Border
            '<rect x="10" y="10" width="330" height="180" rx="10" fill="none" stroke="#6C5CE7" stroke-width="2"/>',
            // Title
            '<text x="175" y="40" text-anchor="middle" font-family="Arial, sans-serif" font-size="18" font-weight="bold" fill="#A29BFE">',
            "DEPOSIT CERTIFICATE",
            "</text>",
            // Certificate Number
            '<text x="175" y="65" text-anchor="middle" font-family="monospace" font-size="12" fill="#888">',
            "#",
            tokenId.toString(),
            "</text>",
            // Amount Label
            '<text x="175" y="95" text-anchor="middle" font-family="Arial, sans-serif" font-size="11" fill="#888">',
            "AMOUNT",
            "</text>",
            // Amount Value
            '<text x="175" y="120" text-anchor="middle" font-family="Arial, sans-serif" font-size="20" font-weight="bold" fill="#fff">',
            formattedAmount,
            "</text>",
            // Plan ID
            '<text x="175" y="150" text-anchor="middle" font-family="Arial, sans-serif" font-size="11" fill="#888">',
            "Plan ID: ",
            data.planId.toString(),
            "</text>",
            // Footer
            '<text x="175" y="175" text-anchor="middle" font-family="Arial, sans-serif" font-size="9" fill="#555">',
            "Saving Bank Protocol",
            "</text>",
            "</svg>"
        );

        return Base64.encode(svg);
    }

    /**
     * @notice Format amount with decimals
     * @param amount Amount to format (18 decimals)
     * @return Formatted string
     */
    function _formatAmount(
        uint256 amount
    ) internal pure returns (string memory) {
        uint256 whole = amount / 1e18;
        uint256 decimals = (amount % 1e18) / 1e16; // 2 decimal places

        if (decimals == 0) {
            return string(abi.encodePacked(whole.toString(), " tokens"));
        }

        // Pad decimals to 2 digits
        string memory decimalStr = decimals < 10
            ? string(abi.encodePacked("0", decimals.toString()))
            : decimals.toString();

        return
            string(
                abi.encodePacked(whole.toString(), ".", decimalStr, " tokens")
            );
    }
}
