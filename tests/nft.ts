import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Nft } from "../target/types/nft";
import { 
  PublicKey, 
  Keypair, 
  SystemProgram,
  SYSVAR_RENT_PUBKEY 
} from "@solana/web3.js";
import { 
  TOKEN_PROGRAM_ID, 
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync
} from "@solana/spl-token";
import { expect } from "chai";

const TOKEN_METADATA_PROGRAM_ID = new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s");

describe("Learning Platform NFT Tests", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.nft as Program<Nft>;
  const user = provider.wallet as anchor.Wallet;

  let userProgressPDA: PublicKey;
  let userProgressBump: number;

  before(async () => {
    [userProgressPDA, userProgressBump] = PublicKey.findProgramAddressSync(
      [Buffer.from("user_progress"), user.publicKey.toBuffer()],
      program.programId
    );
  });

  it("Initialize User Progress", async () => {
    try {
      const tx = await program.methods
        .initializeUser()
        .accounts({
          userProgress: userProgressPDA,
          user: user.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      console.log("User initialized. Transaction signature:", tx);

      const userProgressAccount = await program.account.userProgress.fetch(userProgressPDA);
      
      expect(userProgressAccount.user.toString()).to.equal(user.publicKey.toString());
      expect(userProgressAccount.completedLessons).to.deep.equal([false, false, false, false, false]);
      expect(userProgressAccount.nftsClaimed).to.deep.equal([false, false, false, false, false]);
      
      console.log("✅ User progress initialized successfully");
    } catch (error) {
      if (error.toString().includes("already in use")) {
        console.log("⚠️ Account already exists, skipping initialization");
        return;
      }
      console.error("Error initializing user:", error);
      throw error;
    }
  });

  it("Complete Lesson 0", async () => {
    try {
      const lessonId = 0;
      
      const tx = await program.methods
        .completeLesson(lessonId)
        .accounts({
          userProgress: userProgressPDA,
          user: user.publicKey,
        })
        .rpc();

      console.log("Lesson 0 completed. Transaction signature:", tx);

      const userProgressAccount = await program.account.userProgress.fetch(userProgressPDA);
      expect(userProgressAccount.completedLessons[0]).to.be.true;
      expect(userProgressAccount.completedLessons[1]).to.be.false;
      
      console.log("✅ Lesson 0 completed successfully");
    } catch (error) {
      if (error.toString().includes("LessonAlreadyCompleted")) {
        console.log("⚠️ Lesson already completed");
        return;
      }
      console.error("Error completing lesson:", error);
      throw error;
    }
  });

  it("Mint NFT Reward for Lesson 0", async () => {
    try {
      const lessonId = 0;
      const mintKeypair = Keypair.generate();
      
      const tokenAccount = getAssociatedTokenAddressSync(
        mintKeypair.publicKey,
        user.publicKey,
        false,
        TOKEN_PROGRAM_ID,  // Changed from TOKEN_2022_PROGRAM_ID
        ASSOCIATED_TOKEN_PROGRAM_ID
      );

      const [metadataPDA] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("metadata"),
          TOKEN_METADATA_PROGRAM_ID.toBuffer(),
          mintKeypair.publicKey.toBuffer(),
        ],
        TOKEN_METADATA_PROGRAM_ID
      );

      const metadata = {
        uri: "https://example.com/metadata.json",
        name: "Blockchain Basics Master",
        symbol: "LEARN",
      };

      const tx = await program.methods
        .mintNftReward(lessonId, metadata.uri, metadata.name, metadata.symbol)
        .accounts({
          userProgress: userProgressPDA,
          mint: mintKeypair.publicKey,
          tokenAccount: tokenAccount,
          metadata: metadataPDA,
          user: user.publicKey,
          payer: user.publicKey,
          mintAuthority: user.publicKey,
          rent: SYSVAR_RENT_PUBKEY,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,  
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          tokenMetadataProgram: TOKEN_METADATA_PROGRAM_ID,
        })
        .signers([mintKeypair])
        .rpc();

      console.log("NFT minted for lesson 0. Transaction signature:", tx);
      console.log("Mint address:", mintKeypair.publicKey.toString());

      const userProgressAccount = await program.account.userProgress.fetch(userProgressPDA);
      expect(userProgressAccount.nftsClaimed[0]).to.be.true;
      
      console.log("✅ NFT minted and claimed successfully");
    } catch (error) {
      console.error("Error minting NFT:", error);
      throw error;
    }
  });

  it("Should fail when trying to complete same lesson twice", async () => {
    try {
      const lessonId = 0;
      
      await program.methods
        .completeLesson(lessonId)
        .accounts({
          userProgress: userProgressPDA,
          user: user.publicKey,
        })
        .rpc();
      
      expect.fail("Should have thrown an error for duplicate lesson completion");
    } catch (error) {
      expect(error.toString()).to.include("LessonAlreadyCompleted");
      console.log("✅ Correctly prevented duplicate lesson completion");
    }
  });

  it("Should fail when trying to mint NFT twice for same lesson", async () => {
    try {
      const lessonId = 0;
      const mintKeypair = Keypair.generate();
      
      const tokenAccount = getAssociatedTokenAddressSync(
        mintKeypair.publicKey,
        user.publicKey,
        false,
        TOKEN_PROGRAM_ID, 
        ASSOCIATED_TOKEN_PROGRAM_ID
      );

      const [metadataPDA] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("metadata"),
          TOKEN_METADATA_PROGRAM_ID.toBuffer(),
          mintKeypair.publicKey.toBuffer(),
        ],
        TOKEN_METADATA_PROGRAM_ID
      );

      await program.methods
        .mintNftReward(lessonId, "https://example.com/metadata.json", "Test NFT", "TEST")
        .accounts({
          userProgress: userProgressPDA,
          mint: mintKeypair.publicKey,
          tokenAccount: tokenAccount,
          metadata: metadataPDA,
          user: user.publicKey,
          payer: user.publicKey,
          mintAuthority: user.publicKey,
          rent: SYSVAR_RENT_PUBKEY,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,  
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          tokenMetadataProgram: TOKEN_METADATA_PROGRAM_ID,
        })
        .signers([mintKeypair])
        .rpc();
      
      expect.fail("Should have thrown an error for duplicate NFT claim");
    } catch (error) {
      expect(error.toString()).to.include("NftAlreadyClaimed");
      console.log("✅ Correctly prevented duplicate NFT claim");
    }
  });

  it("Should fail when trying to mint NFT for uncompleted lesson", async () => {
    try {
      const lessonId = 1;
      const mintKeypair = Keypair.generate();
      
      const tokenAccount = getAssociatedTokenAddressSync(
        mintKeypair.publicKey,
        user.publicKey,
        false,
        TOKEN_PROGRAM_ID,  
        ASSOCIATED_TOKEN_PROGRAM_ID
      );

      const [metadataPDA] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("metadata"),
          TOKEN_METADATA_PROGRAM_ID.toBuffer(),
          mintKeypair.publicKey.toBuffer(),
        ],
        TOKEN_METADATA_PROGRAM_ID
      );

      await program.methods
        .mintNftReward(lessonId, "https://example.com/metadata.json", "Test NFT", "TEST")
        .accounts({
          userProgress: userProgressPDA,
          mint: mintKeypair.publicKey,
          tokenAccount: tokenAccount,
          metadata: metadataPDA,
          user: user.publicKey,
          payer: user.publicKey,
          mintAuthority: user.publicKey,
          rent: SYSVAR_RENT_PUBKEY,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,  
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          tokenMetadataProgram: TOKEN_METADATA_PROGRAM_ID,
        })
        .signers([mintKeypair])
        .rpc();
      
      expect.fail("Should have thrown an error for uncompleted lesson");
    } catch (error) {
      expect(error.toString()).to.include("LessonNotCompleted");
      console.log("✅ Correctly prevented NFT claim for uncompleted lesson");
    }
  });

  it("Complete and mint NFT for all remaining lessons", async () => {
    for (let lessonId = 1; lessonId < 5; lessonId++) {
      const completeTx = await program.methods
        .completeLesson(lessonId)
        .accounts({
          userProgress: userProgressPDA,
          user: user.publicKey,
        })
        .rpc();

      console.log(`Lesson ${lessonId} completed. Tx: ${completeTx}`);

      const mintKeypair = Keypair.generate();
      
      const tokenAccount = getAssociatedTokenAddressSync(
        mintKeypair.publicKey,
        user.publicKey,
        false,
        TOKEN_PROGRAM_ID, 
        ASSOCIATED_TOKEN_PROGRAM_ID
      );

      const [metadataPDA] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("metadata"),
          TOKEN_METADATA_PROGRAM_ID.toBuffer(),
          mintKeypair.publicKey.toBuffer(),
        ],
        TOKEN_METADATA_PROGRAM_ID
      );

      const mintTx = await program.methods
        .mintNftReward(
          lessonId, 
          `https://example.com/lesson${lessonId}-metadata.json`, 
          `Lesson ${lessonId} Master`, 
          "LEARN"
        )
        .accounts({
          userProgress: userProgressPDA,
          mint: mintKeypair.publicKey,
          tokenAccount: tokenAccount,
          metadata: metadataPDA,
          user: user.publicKey,
          payer: user.publicKey,
          mintAuthority: user.publicKey,
          rent: SYSVAR_RENT_PUBKEY,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,  
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          tokenMetadataProgram: TOKEN_METADATA_PROGRAM_ID,
        })
        .signers([mintKeypair])
        .rpc();

      console.log(`NFT minted for lesson ${lessonId}. Mint: ${mintKeypair.publicKey.toString()}`);
    }

    const userProgressAccount = await program.account.userProgress.fetch(userProgressPDA);
    expect(userProgressAccount.completedLessons).to.deep.equal([true, true, true, true, true]);
    expect(userProgressAccount.nftsClaimed).to.deep.equal([true, true, true, true, true]);
    
    console.log("✅ All lessons completed and NFTs minted successfully");
  });

  it("Should fail with invalid lesson ID", async () => {
    try {
      const invalidLessonId = 5;
      
      await program.methods
        .completeLesson(invalidLessonId)
        .accounts({
          userProgress: userProgressPDA,
          user: user.publicKey,
        })
        .rpc();
      
      expect.fail("Should have thrown an error for invalid lesson ID");
    } catch (error) {
      expect(error.toString()).to.include("InvalidLessonId");
      console.log("✅ Correctly rejected invalid lesson ID");
    }
  });
});
