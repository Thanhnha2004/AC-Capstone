// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title PrincipalVault
 * @notice Vault để giữ tiền gốc của người dùng khi họ gửi tiết kiệm
 * @dev Sử dụng AccessControl để quản lý ADMIN_ROLE và OPERATOR_ROLE
 */
contract PrincipalVault is AccessControl, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    /*//////////////////////////////////////////////////////////////
                                ERRORS
    //////////////////////////////////////////////////////////////*/
    error InvalidToken();
    error InvalidAmount();
    error InvalidAddress();
    error InsufficientBalance();

    /*//////////////////////////////////////////////////////////////
                              CONSTANTS
    //////////////////////////////////////////////////////////////*/
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");

    /*//////////////////////////////////////////////////////////////
                           STATE VARIABLES
    //////////////////////////////////////////////////////////////*/
    IERC20 public immutable token;
    uint256 public totalBalance; // Tổng số dư token trong vault

    /*//////////////////////////////////////////////////////////////
                             CONSTRUCTOR
    //////////////////////////////////////////////////////////////*/
    constructor(address _token, address _admin, address _operator) {
        if (_token == address(0)) revert InvalidToken();
        if (_admin == address(0)) revert InvalidAddress();
        if (_operator == address(0)) revert InvalidAddress();

        token = IERC20(_token);

        // Grant roles
        _grantRole(DEFAULT_ADMIN_ROLE, _admin);
        _grantRole(ADMIN_ROLE, _admin);
        _grantRole(OPERATOR_ROLE, _operator);
    }

    /*//////////////////////////////////////////////////////////////
                                EVENTS
    //////////////////////////////////////////////////////////////*/
    event PrincipalDeposited(address indexed from, uint256 amount);
    event PrincipalWithdrawn(address indexed to, uint256 amount);
    event AdminFunded(address indexed admin, uint256 amount);
    event AdminWithdrawn(address indexed admin, uint256 amount);
    event SavingBankUpdated(address indexed savingBank);

    /*//////////////////////////////////////////////////////////////
                          ADMIN FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /**
     * @notice Admin nạp thêm tiền vào vault (nếu cần)
     * @param amount Số lượng token
     */
    function depositFund(
        uint256 amount
    ) external onlyRole(ADMIN_ROLE) nonReentrant {
        if (amount == 0) revert InvalidAmount();

        totalBalance += amount;
        token.safeTransferFrom(msg.sender, address(this), amount);

        emit AdminFunded(msg.sender, amount);
    }

    /**
     * @notice Admin rút tiền thừa từ vault
     * @param amount Số lượng token
     */
    function withdrawFund(
        uint256 amount
    ) external onlyRole(ADMIN_ROLE) nonReentrant {
        if (amount == 0) revert InvalidAmount();
        if (amount > totalBalance) revert InsufficientBalance();

        totalBalance -= amount;
        token.safeTransfer(msg.sender, amount);

        emit AdminWithdrawn(msg.sender, amount);
    }

    /**
     * @notice Pause/unpause contract
     */
    function pause() external onlyRole(ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(ADMIN_ROLE) {
        _unpause();
    }

    /*//////////////////////////////////////////////////////////////
                         OPERATOR FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /**
     * @notice Nhận tiền gốc từ SavingBank khi user deposit
     * @param from Địa chỉ gửi tiền
     * @param amount Số lượng token
     */
    function depositPrincipal(
        address from,
        uint256 amount
    ) external onlyRole(OPERATOR_ROLE) whenNotPaused nonReentrant {
        if (from == address(0)) revert InvalidAddress();
        if (amount == 0) revert InvalidAmount();

        totalBalance += amount;
        token.safeTransferFrom(from, address(this), amount);

        emit PrincipalDeposited(from, amount);
    }

    /**
     * @notice Nhận tiền trực tiếp vào vault (cho compound từ InterestVault)
     * @dev Không cần transferFrom vì tiền đã được transfer trực tiếp vào
     * @param user Địa chỉ user (để track)
     * @param amount Số lượng token đã nhận
     */
    function receiveDirectDeposit(
        address user,
        uint256 amount
    ) external onlyRole(OPERATOR_ROLE) whenNotPaused nonReentrant {
        if (user == address(0)) revert InvalidAddress();
        if (amount == 0) revert InvalidAmount();

        // Tiền đã được transfer vào, chỉ cần update balance
        totalBalance += amount;

        emit PrincipalDeposited(user, amount);
    }

    /**
     * @notice Trả tiền gốc cho user khi withdraw
     * @param to Địa chỉ nhận tiền
     * @param amount Số lượng token
     */
    function withdrawPrincipal(
        address to,
        uint256 amount
    ) external onlyRole(OPERATOR_ROLE) whenNotPaused nonReentrant {
        if (to == address(0)) revert InvalidAddress();
        if (amount == 0) revert InvalidAmount();
        if (amount > totalBalance) revert InsufficientBalance();

        totalBalance -= amount;
        token.safeTransfer(to, amount);

        emit PrincipalWithdrawn(to, amount);
    }

    /*//////////////////////////////////////////////////////////////
                          VIEW FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /**
     * @notice Lấy số dư vault
     */
    function getBalance() external view returns (uint256) {
        return totalBalance;
    }

    /**
     * @notice Lấy số dư token thực tế của contract
     */
    function getActualBalance() external view returns (uint256) {
        return token.balanceOf(address(this));
    }
}
