// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract LiquidityVault is Ownable, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    /*//////////////////////////////////////////////////////////////
    ////////////////////         ERRORS       //////////////////////
    //////////////////////////////////////////////////////////////*/
    error InvalidToken();
    error InvalidAmount();
    error InvalidAddress();
    error InsufficientBalance();
    error Unauthorized();

    /*//////////////////////////////////////////////////////////////
    ////////////////////         STRUCTS       /////////////////////
    //////////////////////////////////////////////////////////////*/

    /*//////////////////////////////////////////////////////////////
    /////////////////////         ENUMS       //////////////////////
    //////////////////////////////////////////////////////////////*/

    /*//////////////////////////////////////////////////////////////
    ///////////////////         CONSTANTS       ////////////////////
    //////////////////////////////////////////////////////////////*/

    /*//////////////////////////////////////////////////////////////
    ////////////////         STATE VARIABLES       /////////////////
    //////////////////////////////////////////////////////////////*/
    IERC20 public immutable token;

    address public savingBank; // Address của SavingBank
    uint256 public totalBalance; // số dư token

    /*//////////////////////////////////////////////////////////////
    //////////////////         CONSTRUCTOR       ///////////////////
    //////////////////////////////////////////////////////////////*/
    constructor(address _token) Ownable(msg.sender) {
        if (_token == address(0)) revert InvalidToken();

        token = IERC20(_token);
    }

    /*//////////////////////////////////////////////////////////////
    ////////////////////         EVENTS       //////////////////////
    //////////////////////////////////////////////////////////////*/
    event Funded(address indexed funder, uint256 amount);
    event Withdrawn(address indexed recipient, uint256 amount);
    event SavingBankUpdated(address indexed oldBank, address indexed newBank);
    event InterestPaid(address indexed recipient, uint256 amount);
    event InterestRenewed(address indexed recipient, uint256 amount);

    /*//////////////////////////////////////////////////////////////
    ///////////////////         MODIFIERS       ////////////////////
    //////////////////////////////////////////////////////////////*/
    modifier onlySavingBank() {
        if (msg.sender != savingBank) revert Unauthorized();

        _;
    }

    /*//////////////////////////////////////////////////////////////
    ///////////////         CORE FUNCTIONS       ///////////////////
    //////////////////////////////////////////////////////////////*/

    /*//////////////////////////////////////////////////////////////
    //////////////         ADMIN FUNCTIONS       ///////////////////
    //////////////////////////////////////////////////////////////*/

    /**
     * @notice set địa chỉ cho SavingBank contract
     */
    function setSavingBank(address newSavingBank) external onlyOwner {
        if (newSavingBank == address(0)) revert InvalidAddress();

        address oldBank = savingBank;
        savingBank = newSavingBank;

        emit SavingBankUpdated(oldBank, newSavingBank);
    }

    /**
     * @notice admin nạp tiền vào
     */
    function fundVault(uint256 amount) external onlyOwner {
        if (amount == 0) revert InvalidAmount();

        totalBalance += amount;
        token.safeTransferFrom(msg.sender, address(this), amount);

        emit Funded(msg.sender, amount);
    }

    /**
     * @notice admin rút tiền thừa
     */
    function withdrawVault(uint256 amount) external onlyOwner {
        if (amount == 0) revert InvalidAmount();
        if (amount > totalBalance) revert InsufficientBalance();

        totalBalance -= amount;
        token.safeTransfer(msg.sender, amount);

        emit Withdrawn(msg.sender, amount);
    }

    /**
     * @notice Pause/unpause contract
     */
    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    /*//////////////////////////////////////////////////////////////
    ////////////         SAVINGBANK FUNCTIONS       ////////////////
    //////////////////////////////////////////////////////////////*/

    /**
     * @notice SavingBank gọi để trả lãi cho người dùng
     */
    function payInterest(
        address user,
        uint256 amount
    ) external onlySavingBank whenNotPaused nonReentrant {
        if (user == address(0)) revert InvalidAddress();
        if (amount == 0) revert InvalidAmount();
        if (amount > totalBalance) revert InsufficientBalance();

        totalBalance -= amount;
        token.safeTransfer(user, amount);

        emit InterestPaid(user, amount);
    }

    /**
     * @notice SavingBank gọi gia hạn (thêm lãi vào gốc)
     */
    function deductInterest(
        address user,
        uint256 amount
    ) external onlySavingBank whenNotPaused nonReentrant {
        if (user == address(0)) revert InvalidAddress();
        if (amount == 0) revert InvalidAmount();
        if (amount > totalBalance) revert InsufficientBalance();

        totalBalance -= amount;

        emit InterestRenewed(user, amount);
    }

    /*//////////////////////////////////////////////////////////////
    ///////////////         VIEW FUNCTIONS       ///////////////////
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

    /*//////////////////////////////////////////////////////////////
    //////////////         HELPER FUNCTIONS       //////////////////
    //////////////////////////////////////////////////////////////*/
}
