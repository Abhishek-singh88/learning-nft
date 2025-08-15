use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    metadata::{
        create_metadata_accounts_v3, 
        mpl_token_metadata::types::DataV2, 
        CreateMetadataAccountsV3,
        Metadata as Metaplex,
    },
    token::{mint_to, Mint, MintTo, Token, TokenAccount},
};

declare_id!("7XEngAaTX7dhYjyEcPqtxkMp1oxLsib7TBjsopeu2AGk");

#[program]
pub mod nft {
    use super::*;

    pub fn initialize_user(ctx: Context<InitializeUser>) -> Result<()> {
        let user_progress = &mut ctx.accounts.user_progress;
        user_progress.user = ctx.accounts.user.key();
        user_progress.completed_lessons = [false; 5];
        user_progress.nfts_claimed = [false; 5];
        Ok(())
    }

    pub fn complete_lesson(
        ctx: Context<CompleteLesson>,
        lesson_id: u8,
    ) -> Result<()> {
        require!(lesson_id < 5, ErrorCode::InvalidLessonId);
        
        let user_progress = &mut ctx.accounts.user_progress;
        
        // Check if lesson already completed
        require!(!user_progress.completed_lessons[lesson_id as usize], ErrorCode::LessonAlreadyCompleted);

        // Mark lesson as completed
        user_progress.completed_lessons[lesson_id as usize] = true;

        emit!(LessonCompleted {
            user: ctx.accounts.user.key(),
            lesson_id,
        });

        Ok(())
    }

    pub fn mint_nft_reward(
        ctx: Context<MintNftReward>,
        lesson_id: u8,
        metadata_uri: String,
        name: String,
        symbol: String,
    ) -> Result<()> {
        require!(lesson_id < 5, ErrorCode::InvalidLessonId);
        
        let user_progress = &mut ctx.accounts.user_progress;
        
        // Check if lesson is completed
        require!(user_progress.completed_lessons[lesson_id as usize], ErrorCode::LessonNotCompleted);
        
        // Check if NFT already claimed
        require!(!user_progress.nfts_claimed[lesson_id as usize], ErrorCode::NftAlreadyClaimed);

        // Mint NFT to user
        let cpi_accounts = MintTo {
            mint: ctx.accounts.mint.to_account_info(),
            to: ctx.accounts.token_account.to_account_info(),
            authority: ctx.accounts.mint_authority.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
        mint_to(cpi_ctx, 1)?;

        // Create metadata
        let data_v2 = DataV2 {
            name,
            symbol,
            uri: metadata_uri,
            seller_fee_basis_points: 0,
            creators: None,
            collection: None,
            uses: None,
        };

        let cpi_accounts = CreateMetadataAccountsV3 {
            metadata: ctx.accounts.metadata.to_account_info(),
            mint: ctx.accounts.mint.to_account_info(),
            mint_authority: ctx.accounts.mint_authority.to_account_info(),
            update_authority: ctx.accounts.mint_authority.to_account_info(),
            payer: ctx.accounts.payer.to_account_info(),
            system_program: ctx.accounts.system_program.to_account_info(),
            rent: ctx.accounts.rent.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_metadata_program.to_account_info();
        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);

        create_metadata_accounts_v3(cpi_ctx, data_v2, true, true, None)?;

        // Mark NFT as claimed
        user_progress.nfts_claimed[lesson_id as usize] = true;

        emit!(NftMinted {
            user: ctx.accounts.user.key(),
            lesson_id,
            mint: ctx.accounts.mint.key(),
        });

        Ok(())
    }
}

#[derive(Accounts)]
pub struct InitializeUser<'info> {
    #[account(
        init,
        payer = user,
        space = 8 + UserProgress::INIT_SPACE,
        seeds = [b"user_progress", user.key().as_ref()],
        bump
    )]
    pub user_progress: Account<'info, UserProgress>,
    
    #[account(mut)]
    pub user: Signer<'info>,
    
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(lesson_id: u8)]
pub struct CompleteLesson<'info> {
    #[account(
        mut,
        seeds = [b"user_progress", user.key().as_ref()],
        bump
    )]
    pub user_progress: Account<'info, UserProgress>,
    
    #[account(mut)]
    pub user: Signer<'info>,
}

#[derive(Accounts)]
#[instruction(lesson_id: u8)]
pub struct MintNftReward<'info> {
    #[account(
        mut,
        seeds = [b"user_progress", user.key().as_ref()],
        bump
    )]
    pub user_progress: Account<'info, UserProgress>,
    
    #[account(
        init,
        payer = payer,
        mint::decimals = 0,
        mint::authority = mint_authority,
    )]
    pub mint: Account<'info, Mint>,
    
    #[account(
        init_if_needed,
        payer = payer,
        associated_token::mint = mint,
        associated_token::authority = user,
    )]
    pub token_account: Account<'info, TokenAccount>,
    
    /// CHECK: This is not dangerous because we don't read or write from this account
    #[account(mut)]
    pub metadata: UncheckedAccount<'info>,
    
    #[account(mut)]
    pub user: Signer<'info>,
    
    #[account(mut)]
    pub payer: Signer<'info>,
    
    /// CHECK: This is the mint authority
    pub mint_authority: UncheckedAccount<'info>,
    
    pub rent: Sysvar<'info, Rent>,
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    /// CHECK: This is the token metadata program
    pub token_metadata_program: UncheckedAccount<'info>,
}

#[account]
#[derive(InitSpace)]
pub struct UserProgress {
    pub user: Pubkey,
    pub completed_lessons: [bool; 5],
    pub nfts_claimed: [bool; 5],
}

#[event]
pub struct LessonCompleted {
    pub user: Pubkey,
    pub lesson_id: u8,
}

#[event]
pub struct NftMinted {
    pub user: Pubkey,
    pub lesson_id: u8,
    pub mint: Pubkey,
}

#[error_code]
pub enum ErrorCode {
    #[msg("Invalid lesson ID")]
    InvalidLessonId,
    
    #[msg("Lesson already completed")]
    LessonAlreadyCompleted,
    
    #[msg("Lesson not completed yet")]
    LessonNotCompleted,
    
    #[msg("NFT already claimed for this lesson")]
    NftAlreadyClaimed,
}