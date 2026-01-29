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
    error NotOwner();
    error NotActiveDeposit();
    error NotMaturedYet();
    error AlreadyMatured();
    error AlreadyRenewed();

    /*//////////////////////////////////////////////////////////////
    /////////////////////         ENUMS       //////////////////////
    //////////////////////////////////////////////////////////////*/
    enum DepositStatus {
        Active, // 0: Đang hoạt động
        Withdrawn, // 1: Đã rút đúng hạn
        EarlyWithdrawn, // 2: Đã rút sớm
        Renewed // 3: Đã gia hạn
    }

    /*//////////////////////////////////////////////////////////////
    ////////////////////         STRUCTS       /////////////////////
    //////////////////////////////////////////////////////////////*/
    struct SavingPlan {
        uint256 tenorDays;
        uint256 aprBps;
        uint256 minDeposit;
        uint256 maxDeposit;
        uint256 earlyWithdrawPenaltyBps;
        bool enabled;
    }

    struct DepositCertificate {
        address owner;
        uint256 planId;
        uint256 principal;
        uint256 startAt;
        uint256 maturityAt;
        DepositStatus status; // Changed: bool -> enum
        uint256 renewedDepositId;
        // SNAPSHOT PLAN DATA
        uint256 snapshotAprBps;
        uint256 snapshotTenorDays;
        uint256 snapshotEarlyWithdrawPenaltyBps;
    }

    /*//////////////////////////////////////////////////////////////
    ///////////////////         CONSTANTS       ////////////////////
    //////////////////////////////////////////////////////////////*/
    uint256 private constant SECONDS_PER_YEAR = 365 days;
    uint256 private constant BASIS_POINTS = 10000;

    /*//////////////////////////////////////////////////////////////
    ////////////////         STATE VARIABLES       /////////////////
    //////////////////////////////////////////////////////////////*/
    IERC20 public immutable token;

    uint256 public nextPlanId;
    uint256 public nextDepositId;

    mapping(uint256 => SavingPlan) public savingPlans;
    mapping(uint256 => DepositCertificate) public depositCertificates;
    mapping(address => uint256[]) public userDepositIds;

    ILiquidityVault public vault;
    address public feeReceiver;

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

        nextPlanId = 1;
        nextDepositId = 1;
    }

    /*//////////////////////////////////////////////////////////////
    ////////////////////         EVENTS       //////////////////////
    //////////////////////////////////////////////////////////////*/
    event PlanCreated(
        uint256 indexed planId,
        uint256 tenorDays,
        uint256 aprBps,
        uint256 minDeposit,
        uint256 maxDeposit,
        uint256 earlyWithdrawPenaltyBps
    );
    event FeeReceiverUpdated(address indexed newFeeReceiver);
    event PlanUpdated(uint256 indexed planId, bool isEnabled);
    event VaultUpdated(address indexed newVault);
    event DepositCertificateOpened(
        uint256 indexed depositId,
        address indexed user,
        uint256 indexed planId,
        uint256 depositAmount,
        uint256 maturityTimestamp
    );
    event Withdrawn(
        uint256 indexed depositId,
        address indexed user,
        uint256 principalAmount,
        uint256 interestAmount,
        DepositStatus finalStatus
    );
    event EarlyWithdrawn(
        uint256 indexed depositId,
        address indexed user,
        uint256 amountReceived,
        uint256 penaltyAmount,
        DepositStatus finalStatus
    );
    event Renewed(
        uint256 indexed oldDepositId,
        uint256 indexed newDepositId,
        uint256 newPrincipal
    );

    /*//////////////////////////////////////////////////////////////
    ///////////////////         MODIFIERS       ////////////////////
    //////////////////////////////////////////////////////////////*/

    /*//////////////////////////////////////////////////////////////
    ///////////////         CORE FUNCTIONS       ///////////////////
    //////////////////////////////////////////////////////////////*/

    /**
     * @notice Mở sổ tiết kiệm
     */
    function openDepositCertificate(
        uint256 planId,
        uint256 depositAmount
    ) external whenNotPaused nonReentrant {
        SavingPlan memory plan = savingPlans[planId];

        if (planId <= 0 || planId >= nextPlanId) revert InvalidPlanId();
        if (!plan.enabled) revert NotEnabledPlan();
        if (depositAmount < plan.minDeposit) revert InvalidAmount();
        if (plan.maxDeposit > 0 && depositAmount > plan.maxDeposit)
            revert InvalidAmount();

        address depositor = msg.sender;
        uint256 newDepositId = nextDepositId;
        uint256 maturityTimestamp = block.timestamp + (plan.tenorDays * 1 days);

        depositCertificates[newDepositId] = DepositCertificate({
            owner: depositor,
            planId: planId,
            principal: depositAmount,
            startAt: block.timestamp,
            maturityAt: maturityTimestamp,
            status: DepositStatus.Active,
            renewedDepositId: 0,
            snapshotAprBps: plan.aprBps,
            snapshotTenorDays: plan.tenorDays,
            snapshotEarlyWithdrawPenaltyBps: plan.earlyWithdrawPenaltyBps
        });

        userDepositIds[depositor].push(newDepositId);
        nextDepositId++;

        token.safeTransferFrom(depositor, address(this), depositAmount);
        _safeMint(depositor, newDepositId);

        emit DepositCertificateOpened(
            newDepositId,
            depositor,
            planId,
            depositAmount,
            maturityTimestamp
        );
    }

    /**
     * @notice Rút đúng hạn (gốc + lãi)
     */
    function withdraw(uint256 depositId) external nonReentrant {
        DepositCertificate storage deposit = depositCertificates[depositId];
        address depositor = msg.sender;

        if (depositor != deposit.owner) revert NotOwner();
        if (deposit.status != DepositStatus.Active) revert NotActiveDeposit();
        if (block.timestamp < deposit.maturityAt) revert NotMaturedYet();

        uint256 interestAmount = _calculateInterest(depositId);

        deposit.status = DepositStatus.Withdrawn;

        token.safeTransfer(depositor, deposit.principal);
        vault.payInterest(depositor, interestAmount);

        _burn(depositId);

        emit Withdrawn(
            depositId,
            depositor,
            deposit.principal,
            interestAmount,
            deposit.status
        );
    }

    /**
     * @notice Rút trước hạn (gốc - phạt)
     */
    function earlyWithdraw(uint256 depositId) external nonReentrant {
        DepositCertificate storage deposit = depositCertificates[depositId];
        address depositor = msg.sender;

        if (depositor != deposit.owner) revert NotOwner();
        if (deposit.status != DepositStatus.Active) revert NotActiveDeposit();
        if (block.timestamp >= deposit.maturityAt) revert AlreadyMatured();

        uint256 penaltyAmount = (deposit.principal *
            deposit.snapshotEarlyWithdrawPenaltyBps) / BASIS_POINTS;
        uint256 amountAfterPenalty = deposit.principal - penaltyAmount;

        deposit.status = DepositStatus.EarlyWithdrawn;

        token.safeTransfer(depositor, amountAfterPenalty);
        token.safeTransfer(feeReceiver, penaltyAmount);

        _burn(depositId);

        emit EarlyWithdrawn(
            depositId,
            depositor,
            amountAfterPenalty,
            penaltyAmount,
            deposit.status
        );
    }

    /**
     * @notice gia hạn cùng plan
     */
    function renewWithSamePlan(uint256 depositId) external nonReentrant {
        DepositCertificate storage oldDeposit = depositCertificates[depositId];

        if (msg.sender != oldDeposit.owner) revert NotOwner();
        if (block.timestamp < oldDeposit.maturityAt) revert NotMaturedYet();

        SavingPlan memory plan = savingPlans[oldDeposit.planId];
        if (!plan.enabled) revert NotEnabledPlan();

        uint256 interest = _calculateInterest(depositId);

        uint256 newPrincipal = oldDeposit.principal + interest;
        uint256 newId = nextDepositId;
        address user = msg.sender;
        uint256 maturity = block.timestamp + (plan.tenorDays * 1 days);

        oldDeposit.status = DepositStatus.Renewed;
        oldDeposit.renewedDepositId = newId;

        userDepositIds[user].push(newId);
        nextDepositId++;

        depositCertificates[newId] = DepositCertificate({
            owner: user,
            planId: oldDeposit.planId,
            principal: newPrincipal,
            startAt: block.timestamp,
            maturityAt: maturity,
            status: DepositStatus.Active,
            renewedDepositId: 0,
            snapshotAprBps: plan.aprBps,
            snapshotTenorDays: plan.tenorDays,
            snapshotEarlyWithdrawPenaltyBps: plan.earlyWithdrawPenaltyBps
        });

        vault.deductInterest(user, interest);

        _burn(depositId);
        _safeMint(user, newId);

        emit Renewed(depositId, newId, newPrincipal);
        emit DepositCertificateOpened(
            newId,
            user,
            oldDeposit.planId,
            newPrincipal,
            maturity
        );
    }

    /**
     * @notice gia hạn khác plan
     */
    function renewWithNewPlan(
        uint256 depositId,
        uint256 newPlanId
    ) external nonReentrant {
        DepositCertificate storage oldDeposit = depositCertificates[depositId];

        if (msg.sender != oldDeposit.owner) revert NotOwner();
        if (block.timestamp < oldDeposit.maturityAt) revert NotMaturedYet();

        SavingPlan memory plan = savingPlans[newPlanId];
        if (!plan.enabled) revert NotEnabledPlan();

        uint256 interest = _calculateInterest(depositId);

        uint256 newPrincipal = oldDeposit.principal + interest;
        uint256 newId = nextDepositId;
        address user = msg.sender;
        uint256 maturity = block.timestamp + (plan.tenorDays * 1 days);

        oldDeposit.status = DepositStatus.Renewed;
        oldDeposit.renewedDepositId = newId;

        userDepositIds[user].push(newId);
        nextDepositId++;

        vault.deductInterest(user, interest);

        depositCertificates[newId] = DepositCertificate({
            owner: user,
            planId: newPlanId,
            principal: newPrincipal,
            startAt: block.timestamp,
            maturityAt: maturity,
            status: DepositStatus.Active,
            renewedDepositId: 0,
            snapshotAprBps: plan.aprBps,
            snapshotTenorDays: plan.tenorDays,
            snapshotEarlyWithdrawPenaltyBps: plan.earlyWithdrawPenaltyBps
        });

        _burn(depositId);
        _safeMint(user, newId);

        emit Renewed(depositId, newId, newPrincipal);
        emit DepositCertificateOpened(
            newId,
            user,
            newPlanId,
            newPrincipal,
            maturity
        );
    }

    /*//////////////////////////////////////////////////////////////
    //////////////         ADMIN FUNCTIONS       ///////////////////
    //////////////////////////////////////////////////////////////*/

    function setVault(address newVault) external onlyOwner {
        if (newVault == address(0)) revert InvalidVault();
        vault = ILiquidityVault(newVault);
        emit VaultUpdated(newVault);
    }

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

        uint256 newPlanId = nextPlanId;

        savingPlans[newPlanId] = SavingPlan({
            tenorDays: tenorDays,
            aprBps: aprBps,
            minDeposit: minDeposit,
            maxDeposit: maxDeposit,
            earlyWithdrawPenaltyBps: earlyWithdrawPenaltyBps,
            enabled: true
        });

        nextPlanId++;

        emit PlanCreated(
            newPlanId,
            tenorDays,
            aprBps,
            minDeposit,
            maxDeposit,
            earlyWithdrawPenaltyBps
        );
    }

    function updatePlanStatus(
        uint256 planId,
        bool isEnabled
    ) external onlyOwner {
        if (planId <= 0 || planId >= nextPlanId) revert InvalidPlanId();
        savingPlans[planId].enabled = isEnabled;
        emit PlanUpdated(planId, isEnabled);
    }

    function updatePlan(
        uint256 planId,
        uint256 tenorDays,
        uint256 aprBps,
        uint256 minDeposit,
        uint256 maxDeposit,
        uint256 earlyWithdrawPenaltyBps
    ) external onlyOwner {
        if (planId <= 0 || planId >= nextPlanId) revert InvalidPlanId();
        if (tenorDays == 0) revert InvalidTenor();
        if (aprBps == 0) revert InvalidAPR();
        if (minDeposit == 0) revert InvalidMinDeposit();
        if (maxDeposit > 0 && maxDeposit < minDeposit)
            revert InvalidMaxDeposit();
        if (
            earlyWithdrawPenaltyBps == 0 ||
            earlyWithdrawPenaltyBps > BASIS_POINTS
        ) revert NotExceed();

        SavingPlan storage plan = savingPlans[planId];
        plan.tenorDays = tenorDays;
        plan.aprBps = aprBps;
        plan.minDeposit = minDeposit;
        plan.maxDeposit = maxDeposit;
        plan.earlyWithdrawPenaltyBps = earlyWithdrawPenaltyBps;

        emit PlanUpdated(planId, plan.enabled);
    }

    function setFeeReceiver(address newFeeReceiver) external onlyOwner {
        if (newFeeReceiver == address(0)) revert InvalidAddress();
        feeReceiver = newFeeReceiver;
        emit FeeReceiverUpdated(newFeeReceiver);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    /*//////////////////////////////////////////////////////////////
    ///////////////         VIEW FUNCTIONS       ///////////////////
    //////////////////////////////////////////////////////////////*/

    function getPlanInfo(
        uint256 planId
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
        SavingPlan memory plan = savingPlans[planId];
        return (
            plan.tenorDays,
            plan.aprBps,
            plan.minDeposit,
            plan.maxDeposit,
            plan.earlyWithdrawPenaltyBps,
            plan.enabled
        );
    }

    function getUserDepositIds(
        address user
    ) external view returns (uint256[] memory) {
        return userDepositIds[user];
    }

    function getCalculateInterest(
        uint256 depositId
    ) external view returns (uint256) {
        return _calculateInterest(depositId);
    }

    function getDepositInfo(
        uint256 depositId
    )
        external
        view
        returns (
            address owner,
            uint256 planId,
            uint256 principal,
            uint256 startAt,
            uint256 maturityAt,
            DepositStatus status,
            uint256 renewedDepositId
        )
    {
        DepositCertificate memory deposit = depositCertificates[depositId];
        return (
            deposit.owner,
            deposit.planId,
            deposit.principal,
            deposit.startAt,
            deposit.maturityAt,
            deposit.status,
            deposit.renewedDepositId
        );
    }

    /*//////////////////////////////////////////////////////////////
    //////////////         HELPER FUNCTIONS       //////////////////
    //////////////////////////////////////////////////////////////*/

    function _calculateInterest(
        uint256 depositId
    ) internal view returns (uint256) {
        DepositCertificate memory deposit = depositCertificates[depositId];

        uint256 tenorSeconds = deposit.snapshotTenorDays * 1 days;

        uint256 interestAmount = (deposit.principal *
            deposit.snapshotAprBps *
            tenorSeconds) / (SECONDS_PER_YEAR * BASIS_POINTS);

        return interestAmount;
    }
}
