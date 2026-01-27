// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface ILiquidityVault {
    function payInterest(address user, uint256 amount) external;
    function deductInterest(address user, uint256 amount) external;
    function getBalance() external view returns (uint256);
    function getActualBalance() external view returns (uint256);
}

contract SavingBank is ERC721, Ownable, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    /*//////////////////////////////////////////////////////////////
    ////////////////////         ERRORS       //////////////////////
    //////////////////////////////////////////////////////////////*/
    error InvalidToken();
    error InvalidVault();
    error NotEnabledPlan();
    error InvalidAmount();
    error InvalidAddress();
    error InvalidTenor();
    error InvalidAPR();
    error InvalidMinDeposit();
    error InvalidMaxDeposit();
    error NotExceed();
    error InvalidPlanId();

    /*//////////////////////////////////////////////////////////////
    ////////////////////         STRUCTS       /////////////////////
    //////////////////////////////////////////////////////////////*/
    struct SavingPlan {
        uint256 tenorDays; // kỳ hạn (7/30/90/180…)
        uint256 aprBps; // lãi suất năm (800 = 8%)
        uint256 minDeposit; // số tiền gửi tối thiểu
        uint256 maxDeposit; // số tiền gửi tối đa
        uint256 earlyWithdrawPenaltyBps; // phạt rút trước hạn (500 = 5%)
        bool enabled; // bật/tắt saving plan
    }

    struct DepositCertificate {
        address owner; // người sở hữu
        uint256 planId; // id saving plan
        uint256 principal; // số tiền gốc
        uint256 startAt; // thời điểm bắt đầu
        uint256 maturityAt; // thời điểm đến hạn
        bool status; // trạng thái (true/false)
        uint256 renew; // deposit mới khi đáo hạn
        // SNAPSHOT PLAN DATA
        uint256 snapshotAprBps; // lãi suất được lock
        uint256 snapshotTenorDays; // kỳ hạn được lock
        uint256 snapshotEarlyWithdrawPenaltyBps; // phạt rút sớm được lock
    }

    /*//////////////////////////////////////////////////////////////
    /////////////////////         ENUMS       //////////////////////
    //////////////////////////////////////////////////////////////*/

    /*//////////////////////////////////////////////////////////////
    ///////////////////         CONSTANTS       ////////////////////
    //////////////////////////////////////////////////////////////*/
    uint256 private constant SECONDS_PER_YEAR = 365 days;
    uint256 private constant BASIS_POINTS = 10000;
    uint256 private constant DEFAULT_GRACE_PERIOD = 7 days;

    /*//////////////////////////////////////////////////////////////
    ////////////////         STATE VARIABLES       /////////////////
    //////////////////////////////////////////////////////////////*/
    IERC20 public immutable token;

    uint256 public planId;
    uint256 public depositId;

    mapping(uint256 => SavingPlan) public savingPlans;
    mapping(uint256 => DepositCertificate) public depositCertificates;
    mapping(address => uint256[]) public userDepositIds;

    ILiquidityVault public vault; // địa chỉ LiquidityVault contract
    address public feeReceiver; // địa chỉ người nhận phí phạt khi rút sớm

    /*//////////////////////////////////////////////////////////////
    //////////////////         CONSTRUCTOR       ///////////////////
    //////////////////////////////////////////////////////////////*/
    constructor(
        address _token,
        address _vault,
        address _feeReceiver
    ) ERC721("Saving Bank Certificate", "SBC") Ownable(msg.sender) {
        if (_token == address(0)) revert InvalidToken();
        if (_vault == address(0)) revert InvalidVault();
        if (_feeReceiver == address(0)) revert InvalidToken();

        token = IERC20(_token);
        vault = ILiquidityVault(_vault);
        feeReceiver = _feeReceiver;

        planId = 1;
        depositId = 1;
    }

    /*//////////////////////////////////////////////////////////////
    ////////////////////         EVENTS       //////////////////////
    //////////////////////////////////////////////////////////////*/
    event PlanCreated(
        uint256 planId,
        uint256 tenorDays,
        uint256 aprBps,
        uint256 minDeposit,
        uint256 maxDeposit,
        uint256 earlyWithdrawPenaltyBps
    );
    event FeeReceiverUpdated(address indexed newFeeReceiver);
    event PlanUpdated(uint256 planId, bool status);
    event VaultUpdated(address indexed newVault);

    /*//////////////////////////////////////////////////////////////
    ///////////////////         MODIFIERS       ////////////////////
    //////////////////////////////////////////////////////////////*/

    /*//////////////////////////////////////////////////////////////
    ///////////////         CORE FUNCTIONS       ///////////////////
    //////////////////////////////////////////////////////////////*/

    /*//////////////////////////////////////////////////////////////
    //////////////         ADMIN FUNCTIONS       ///////////////////
    //////////////////////////////////////////////////////////////*/

    /**
     * @notice set địa chỉ cho LiquidityVault contract
     */
    function setVault(address newVault) external onlyOwner {
        if (newVault == address(0)) revert InvalidVault();

        vault = ILiquidityVault(newVault);

        emit VaultUpdated(newVault);
    }

    /**
     * @notice tạo gói tiết kiệm mới
     */
    function createPlan(
        uint256 tenorDays,
        uint256 aprBps,
        uint256 minDeposit,
        uint256 maxDeposit,
        uint256 earlyWithdrawPenaltyBps
    ) external onlyOwner {
        if (tenorDays == 0) revert InvalidTenor();
        if (aprBps == 0) revert InvalidAPR();
        if (minDeposit == 0) revert InvalidMinDeposit();
        if (maxDeposit > 0 && maxDeposit < minDeposit)
            revert InvalidMaxDeposit();
        if (
            earlyWithdrawPenaltyBps == 0 ||
            earlyWithdrawPenaltyBps > BASIS_POINTS
        ) revert NotExceed();

        uint256 id = planId;

        savingPlans[id] = SavingPlan({
            tenorDays: tenorDays,
            aprBps: aprBps,
            minDeposit: minDeposit,
            maxDeposit: maxDeposit,
            earlyWithdrawPenaltyBps: earlyWithdrawPenaltyBps,
            enabled: true
        });

        planId++;

        emit PlanCreated(
            id,
            tenorDays,
            aprBps,
            minDeposit,
            maxDeposit,
            earlyWithdrawPenaltyBps
        );
    }

    /**
     * @notice Cập nhật trạng thái enabled của plan
     */
    function updatePlanStatus(uint256 id, bool enabled) external onlyOwner {
        if (id <= 0 || id >= planId) revert InvalidPlanId();

        savingPlans[id].enabled = enabled;

        emit PlanUpdated(id, enabled);
    }

    /**
     * @notice Cập nhật plan
     */
    function updatePlan(
        uint256 id,
        uint256 tenorDays,
        uint256 aprBps,
        uint256 minDeposit,
        uint256 maxDeposit,
        uint256 earlyWithdrawPenaltyBps
    ) external onlyOwner {
        if (id <= 0 || id >= planId) revert InvalidPlanId();
        if (tenorDays == 0) revert InvalidTenor();
        if (aprBps == 0) revert InvalidAPR();
        if (minDeposit == 0) revert InvalidMinDeposit();
        if (maxDeposit > 0 && maxDeposit < minDeposit)
            revert InvalidMaxDeposit();
        if (
            earlyWithdrawPenaltyBps == 0 ||
            earlyWithdrawPenaltyBps > BASIS_POINTS
        ) revert NotExceed();

        SavingPlan storage plan = savingPlans[id];
        plan.tenorDays = tenorDays;
        plan.aprBps = aprBps;
        plan.minDeposit = minDeposit;
        plan.maxDeposit = maxDeposit;
        plan.earlyWithdrawPenaltyBps = earlyWithdrawPenaltyBps;

        emit PlanUpdated(id, plan.enabled);
    }

    /**
     * @notice cập nhật địa chỉ FeeReceiver
     */
    function setFeeReceiver(address newFeeReceiver) external onlyOwner {
        if (newFeeReceiver == address(0)) revert InvalidAddress();

        feeReceiver = newFeeReceiver;

        emit FeeReceiverUpdated(newFeeReceiver);
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
    ///////////////         VIEW FUNCTIONS       ///////////////////
    //////////////////////////////////////////////////////////////*/

    /**
     * @notice Lấy thông tin plan
     */
    function getPlanInfo(
        uint256 id
    )
        external
        view
        returns (
            uint256 tenorDays,
            uint256 aprBps,
            uint256 minDeposit,
            uint256 maxDeposit,
            uint256 earlyWithdrawPenaltyBps,
            bool enabled
        )
    {
        SavingPlan memory plan = savingPlans[id];
        return (
            plan.tenorDays,
            plan.aprBps,
            plan.minDeposit,
            plan.maxDeposit,
            plan.earlyWithdrawPenaltyBps,
            plan.enabled
        );
    }

    /*//////////////////////////////////////////////////////////////
    //////////////         HELPER FUNCTIONS       //////////////////
    //////////////////////////////////////////////////////////////*/
}
