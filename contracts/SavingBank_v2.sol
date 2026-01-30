// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface IPrincipalVault {
    function depositPrincipal(address from, uint256 amount) external;
    function receiveDirectDeposit(address user, uint256 amount) external;
    function withdrawPrincipal(address to, uint256 amount) external;
    function getBalance() external view returns (uint256);
}

interface IInterestVault {
    function payInterest(address user, uint256 amount) external;
    function transferInterestToPrincipal(
        address principalVault,
        address user,
        uint256 amount
    ) external;
    function getBalance() external view returns (uint256);
}

interface ISavingBankNFT {
    function mint(
        address to,
        uint256 tokenId,
        uint256 planId,
        uint256 depositAmount
    ) external;
    function burn(uint256 tokenId) external;
    function ownerOf(uint256 tokenId) external view returns (address);
}

/**
 * @title SavingBankV3
 * @notice Saving Bank với Access Control và 2 vault riêng biệt
 * @dev Không giữ tiền, tất cả tiền được giữ ở PrincipalVault và InterestVault
 */
contract SavingBankV2 is AccessControl, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    /*//////////////////////////////////////////////////////////////
                                ERRORS
    //////////////////////////////////////////////////////////////*/
    error InvalidToken();
    error InvalidVault();
    error InvalidNFT();
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
                              CONSTANTS
    //////////////////////////////////////////////////////////////*/
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");

    uint256 private constant SECONDS_PER_YEAR = 365 days;
    uint256 private constant BASIS_POINTS = 10000;

    /*//////////////////////////////////////////////////////////////
                                ENUMS
    //////////////////////////////////////////////////////////////*/
    enum DepositStatus {
        Active,
        Withdrawn,
        EarlyWithdrawn,
        Renewed
    }

    /*//////////////////////////////////////////////////////////////
                               STRUCTS
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
        DepositStatus status;
        uint256 renewedDepositId;
        // SNAPSHOT PLAN DATA
        uint256 snapshotAprBps;
        uint256 snapshotTenorDays;
        uint256 snapshotEarlyWithdrawPenaltyBps;
    }

    /*//////////////////////////////////////////////////////////////
                           STATE VARIABLES
    //////////////////////////////////////////////////////////////*/
    IERC20 public immutable token;
    ISavingBankNFT public nft;

    uint256 public nextPlanId;
    uint256 public nextDepositId;

    mapping(uint256 => SavingPlan) public savingPlans;
    mapping(uint256 => DepositCertificate) public depositCertificates;
    mapping(address => uint256[]) public userDepositIds;

    IPrincipalVault public principalVault;
    IInterestVault public interestVault;
    address public feeReceiver;

    /*//////////////////////////////////////////////////////////////
                             CONSTRUCTOR
    //////////////////////////////////////////////////////////////*/
    constructor(
        address _token,
        address _principalVault,
        address _interestVault,
        address _nft,
        address _feeReceiver,
        address _admin,
        address _operator
    ) {
        if (_token == address(0)) revert InvalidToken();
        if (_principalVault == address(0)) revert InvalidVault();
        if (_interestVault == address(0)) revert InvalidVault();
        if (_nft == address(0)) revert InvalidNFT();
        if (_feeReceiver == address(0)) revert InvalidAddress();
        if (_admin == address(0)) revert InvalidAddress();
        if (_operator == address(0)) revert InvalidAddress();

        token = IERC20(_token);
        principalVault = IPrincipalVault(_principalVault);
        interestVault = IInterestVault(_interestVault);
        nft = ISavingBankNFT(_nft);
        feeReceiver = _feeReceiver;

        nextPlanId = 1;
        nextDepositId = 1;

        // Grant roles
        _grantRole(ADMIN_ROLE, _admin);
        _grantRole(OPERATOR_ROLE, _operator);
    }

    /*//////////////////////////////////////////////////////////////
                                EVENTS
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
    event VaultUpdated(
        address indexed newPrincipalVault,
        address indexed newInterestVault
    );
    event NFTUpdated(address indexed newNFT);
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
                          CORE FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /**
     * @notice Open a new deposit certificate
     */
    function openDepositCertificate(
        uint256 planId,
        uint256 depositAmount
    ) external whenNotPaused nonReentrant {
        SavingPlan memory plan = savingPlans[planId];

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

        // User transfer trực tiếp vào PrincipalVault
        principalVault.depositPrincipal(depositor, depositAmount);

        // Mint NFT certificate
        nft.mint(depositor, newDepositId, planId, depositAmount);

        emit DepositCertificateOpened(
            newDepositId,
            depositor,
            planId,
            depositAmount,
            maturityTimestamp
        );
    }

    /**
     * @notice Withdraw at maturity (principal + interest)
     */
    function withdraw(uint256 depositId) external whenNotPaused nonReentrant {
        DepositCertificate storage deposit = depositCertificates[depositId];

        if (deposit.owner != msg.sender) revert NotOwner();
        if (deposit.status != DepositStatus.Active) revert NotActiveDeposit();
        if (block.timestamp < deposit.maturityAt) revert NotMaturedYet();

        uint256 interest = _calculateInterest(depositId);

        deposit.status = DepositStatus.Withdrawn;

        // Trả lãi từ InterestVault
        interestVault.payInterest(msg.sender, interest);

        // Trả gốc từ PrincipalVault
        principalVault.withdrawPrincipal(msg.sender, deposit.principal);

        // Burn NFT
        nft.burn(depositId);

        emit Withdrawn(
            depositId,
            msg.sender,
            deposit.principal,
            interest,
            DepositStatus.Withdrawn
        );
    }

    /**
     * @notice Early withdraw with penalty
     */
    function earlyWithdraw(uint256 depositId) external nonReentrant {
        DepositCertificate storage deposit = depositCertificates[depositId];

        if (deposit.owner != msg.sender) revert NotOwner();
        if (deposit.status != DepositStatus.Active) revert NotActiveDeposit();
        if (block.timestamp >= deposit.maturityAt) revert AlreadyMatured();

        uint256 penalty = (deposit.principal *
            deposit.snapshotEarlyWithdrawPenaltyBps) / BASIS_POINTS;
        uint256 amountToUser = deposit.principal - penalty;

        deposit.status = DepositStatus.EarlyWithdrawn;

        // Trả tiền cho user (principal - penalty)
        principalVault.withdrawPrincipal(msg.sender, amountToUser);

        // Chuyển penalty cho feeReceiver
        principalVault.withdrawPrincipal(feeReceiver, penalty);

        // Burn NFT
        nft.burn(depositId);

        emit EarlyWithdrawn(
            depositId,
            msg.sender,
            amountToUser,
            penalty,
            DepositStatus.EarlyWithdrawn
        );
    }

    /**
     * @notice Renew deposit at maturity to a new plan (compound)
     */
    function renew(uint256 depositId, uint256 newPlanId) external nonReentrant {
        DepositCertificate storage oldDeposit = depositCertificates[depositId];

        if (oldDeposit.owner != msg.sender) revert NotOwner();
        if (block.timestamp < oldDeposit.maturityAt) revert NotMaturedYet();
        if (oldDeposit.renewedDepositId != 0) revert AlreadyRenewed();
        if (oldDeposit.status != DepositStatus.Active)
            revert NotActiveDeposit();

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

        // InterestVault transfer lãi trực tiếp vào PrincipalVault
        interestVault.transferInterestToPrincipal(
            address(principalVault),
            user,
            interest
        );

        // PrincipalVault update balance sau khi nhận tiền
        principalVault.receiveDirectDeposit(user, interest);

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

        // Burn old NFT and mint new NFT
        nft.burn(depositId);
        nft.mint(user, newId, newPlanId, newPrincipal);

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
                       OPERATOR FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /**
     * @notice Operator tạo plan mới
     */
    function createPlan(
        uint256 tenorDays,
        uint256 aprBps,
        uint256 minDeposit,
        uint256 maxDeposit,
        uint256 earlyWithdrawPenaltyBps
    ) external onlyRole(OPERATOR_ROLE) {
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

    /**
     * @notice Operator update plan status
     */
    function updatePlanStatus(
        uint256 planId,
        bool isEnabled
    ) external onlyRole(OPERATOR_ROLE) {
        if (planId <= 0 || planId >= nextPlanId) revert InvalidPlanId();
        savingPlans[planId].enabled = isEnabled;
        emit PlanUpdated(planId, isEnabled);
    }

    /**
     * @notice Operator update plan
     */
    function updatePlan(
        uint256 planId,
        uint256 tenorDays,
        uint256 aprBps,
        uint256 minDeposit,
        uint256 maxDeposit,
        uint256 earlyWithdrawPenaltyBps
    ) external onlyRole(OPERATOR_ROLE) {
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

    /*//////////////////////////////////////////////////////////////
                          ADMIN FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    function setVaults(
        address newPrincipalVault,
        address newInterestVault
    ) external onlyRole(ADMIN_ROLE) {
        if (newPrincipalVault == address(0)) revert InvalidVault();
        if (newInterestVault == address(0)) revert InvalidVault();

        principalVault = IPrincipalVault(newPrincipalVault);
        interestVault = IInterestVault(newInterestVault);

        emit VaultUpdated(newPrincipalVault, newInterestVault);
    }

    function setNFT(address newNFT) external onlyRole(ADMIN_ROLE) {
        if (newNFT == address(0)) revert InvalidNFT();
        nft = ISavingBankNFT(newNFT);
        emit NFTUpdated(newNFT);
    }

    function setFeeReceiver(
        address newFeeReceiver
    ) external onlyRole(ADMIN_ROLE) {
        if (newFeeReceiver == address(0)) revert InvalidAddress();
        feeReceiver = newFeeReceiver;
        emit FeeReceiverUpdated(newFeeReceiver);
    }

    function pause() external onlyRole(ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(ADMIN_ROLE) {
        _unpause();
    }

    /*//////////////////////////////////////////////////////////////
                          VIEW FUNCTIONS
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
                         HELPER FUNCTIONS
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
